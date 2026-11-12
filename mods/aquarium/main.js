import { View, div, image } from "gpui-kit";
import { h_flex, v_flex, Button, Switch, Radio, RadioGroup, Popover } from "gpui-base";
import { agents, terminals, spaces, theme, run, shared, setShared, props, focused, nextCommand, window as appWindow } from "herdr";
import { parkMotion, startMotion, advanceMotion } from "./motion.js";
import { fishPresentation, familyNeedsAttention } from "./presentation.js";
import { SPECIES, familyChoiceKey, savedSpecies, speciesName, detailsFor, schoolGeometry, floatingSchoolGeometry, fishAsset, newCompletions, schoolAgents, schoolFamilies, surfaceGeometry } from "./model.js";

const ART = "mods/aquarium/assets";
// Dark lettering sits directly on the bright habitat, without label cards.
const tankInk = { background: "#173b46", foreground: "#0a2028", working: "#b7efdb", blocked: "#ffd0b5", done: "#ffe49b", idle: "#d2e5e5" };
const statusLabel = { working: "Working", blocked: "Needs you", done: "Finished", idle: "Resting" };

export default class Aquarium extends View {
  init(_props, cx) {
    this.hovered = null;
    this.size = { width: 900, height: 500 };
    this.previous = new Map();
    this.shimmers = new Map();
    this.optionsOpen = false;
    this.pickerTarget = null;
    this.inspected = null;
    this.motion = new Map();
    this.motionDue = Infinity;
    this.motionGeneration = 0;
    this.suspended = false;
    this.closed = false;
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        if (command === "motion") setShared("aquarium.paused", shared("aquarium.paused") === false);
        if (command === "turning") setShared("aquarium.turning", shared("aquarium.turning") === false);
        if (command === "bubbles") setShared("aquarium.bubbles", shared("aquarium.bubbles") === false);
        if (command === "water") setShared("aquarium.water", shared("aquarium.water") === false);
        if (command === "arrangement") setShared("aquarium.free", shared("aquarium.free") === false);
        if (command === "options") { this.optionsOpen = !this.optionsOpen; cx.notify(); }
        if (command === "resume") { this.suspended = false; cx.notify(); }
      }
    });
  }

  stopMotion() {
    // All callers stop aquarium activity (close, explicit navigation, or inactive window).
    this.pickerTarget = null;
    for (const task of this.shimmers.values()) task.cancel();
    this.shimmers.clear();
    this.motionTask?.cancel();
    this.motionTask = null;
    this.motionDue = Infinity;
    this.motionGeneration++;
    const now = Date.now();
    for (const entry of this.motion.values()) {
      entry.state = parkMotion(entry.geometry, entry.state, now);
      entry.key = null;
      entry.version++;
    }
  }

  async close() {
    this.closed = true;
    this.stopMotion();
  }

  syncCompletions(school, paused, cx) {
    if (this.closed) return;
    // Window inactivity is not copy visibility; explicit navigation owns suspension.
    paused = paused || this.suspended || !appWindow()?.active;
    const current = new Map(school.map(agent => [agent.address, agent.status]));
    for (const [address, task] of this.shimmers) {
      if (paused || current.get(address) !== "done") {
        task.cancel();
        this.shimmers.delete(address);
      }
    }
    for (const agent of newCompletions(this.previous, school)) {
      if (paused) continue;
      const task = cx.timer.after(3000, cx => {
        if (!this.closed && this.shimmers.get(agent.address) === task) {
          this.shimmers.delete(agent.address);
          cx.notify();
        }
      });
      this.shimmers.set(agent.address, task);
    }
    this.previous = current;
  }

  syncMotion(families, enabled, speed, soft, cx) {
    if (this.closed) return;
    enabled = Boolean(enabled && !this.suspended && appWindow()?.active);
    const now = Date.now();
    const addresses = new Set();
    for (const { leader, children = [], layout: g } of families) {
      addresses.add(leader.address);
      const held = this.pickerTarget?.address === leader.address || this.hovered === leader.address || children.some(({ agent }) => agent.address === this.hovered);
      const active = enabled && !held && !familyNeedsAttention({ leader, children }) && leader.status !== "done" && (g.maxX > 0 || g.maxY > 0);
      const key = [g.width, g.height, g.maxX, g.maxY, g.top, active, speed, soft].join(":");
      const previous = this.motion.get(leader.address);
      if (previous?.key === key) continue;
      this.motion.set(leader.address, { key, geometry: g, speed, soft,
        version: (previous?.version ?? 0) + 1,
        state: active ? startMotion(g, previous?.state, now) : parkMotion(g, previous?.state, now) });
    }
    for (const address of this.motion.keys()) if (!addresses.has(address)) this.motion.delete(address);
    this.scheduleMotion(cx);
  }

  scheduleMotion(cx) {
    const due = this.closed || this.suspended ? Infinity
      : Math.min(Infinity, ...[...this.motion.values()].map(entry => entry.state.due));
    if (due === this.motionDue) return;
    this.motionTask?.cancel();
    this.motionTask = null;
    this.motionDue = due;
    const generation = ++this.motionGeneration;
    if (!Number.isFinite(due)) return;
    // Route decisions wake infrequently; native transitions draw every intervening frame.
    this.motionTask = cx.timer.after(Math.max(1, due - Date.now()), cx => {
      if (generation !== this.motionGeneration) return;
      this.motionTask = null;
      this.motionDue = Infinity;
      if (this.closed || this.suspended || !appWindow()?.active) { this.stopMotion(); cx.notify(); return; }
      const now = Date.now();
      for (const entry of this.motion.values()) {
        entry.state = advanceMotion(entry.state, entry.geometry, now, entry.speed, entry.soft);
      }
      cx.notify();
      this.scheduleMotion(cx);
    });
  }

  button(id, label, action, index = 0) {
    const t = theme();
    return Button.new(id).tab_index(index).px(10).py(5).rounded(6).text_size(12)
      .text_color(t.foreground).bg(t.surface).border(1).border_color("#00000000")
      .focus(s => s.border_color(t.accent)).hover(s => s.bg(t.hover))
      .accessibility_label(label).when(Boolean(action), el => el.on_click(action)).child(label);
  }

  render(cx) {
    const t = theme();
    const immersive = Boolean(props()?.immersive);
    const all = terminals();
    const nativeSpaces = spaces();
    const school = schoolAgents(agents(), all);
    if (this.hovered && !school.some(a => a.address === this.hovered)) this.hovered = null;
    const focusedAgent = school.find(a => a.address === focused()?.agent);
    if (props()?.terminal) {
      const agent = focusedAgent;
      return h_flex().size_full().px(14).gap(12).items_center().bg(t.chrome)
        .child(this.button("back-to-water", "Back to aquarium", () => {
          run("layout.select", { stack: "aquarium-view", child: "tank-view" });
          run("aquarium.resume");
        }))
        .child(div().flex_1().truncate().text_size(13).text_color(t.foreground).child(agent?.title || "Agent terminal"))
        .child(this.button("back-to-workspace", "Workspace", () => { this.suspended = true; this.stopMotion(); run("layout.switch", { name: "aquarium" }); run("aquarium.resume"); }, 1));
    }

    const paused = shared("aquarium.paused") !== false;
    const activeWindow = Boolean(appWindow()?.active);
    if (!activeWindow || this.suspended) this.pickerTarget = null;
    const animate = !paused && !this.suspended && activeWindow;
    const turning = shared("aquarium.turning") !== false;
    const bubbles = shared("aquarium.bubbles") !== false;
    const water = shared("aquarium.water") !== false;
    const free = shared("aquarium.free") !== false;
    const speed = shared("aquarium.speed") === "normal" ? "normal" : "slow";
    this.syncCompletions(school, !animate, cx);
    const selected = school.find(a => a.address === this.hovered)
      ?? focusedAgent ?? school.find(a => a.focused) ?? school[0];
    const detail = selected ? detailsFor(selected, all.find(a => a.address === selected.address)) : null;
    const families = schoolFamilies(school, all);
    const geometry = schoolGeometry(Math.max(120, this.size.width - 32), Math.max(170, this.size.height - 140), families.length, immersive);
    const lane = geometry.lane;
    const open = a => {
      // Raw background children have no mapped pane/agent block target.
      // Follow Herdr's native child-list workflow without changing workspace scope.
      if (!agents().some(mapped => mapped.address === a.address)) {
        run("terminal.peek", { terminal: a.address });
        return;
      }
      run("agent.focus", { terminal: a.address });
      if (immersive) {
        this.suspended = true;
        this.stopMotion();
        run("layout.select", { stack: "aquarium-view", child: "terminal-view" });
      }
    };

    const hasAttention = school.some(a => a.status === "blocked");
    let tabIndex = 2;
    const drawFish = (a, width, scale, leader) => {
      const choiceKey = familyChoiceKey(leader, nativeSpaces);
      const choice = choiceKey ? savedSpecies(shared(choiceKey)) : null;
      const d = detailsFor(a, all.find(terminal => terminal.address === a.address));
      if (leader !== a) d.push(`Fish family: ${leader.title || leader.program.name}`);
      const color = tankInk[a.status] ?? tankInk.idle;
      const moving = animate && a.status !== "done" && a.status !== "blocked";
      const needsYou = a.status === "blocked";
      const traveling = moving && !free;
      const presentation = fishPresentation(width, scale, needsYou, free);
      const fishSize = presentation.size;
      const travelWidth = presentation.travelWidth;
      const haloSize = 180 * scale;
      const motion = this.motion.get(leader.address);
      const pose = free
        ? div().id(`pose-${a.address}-${motion?.version}`).relative().size_full()
          .opacity(motion?.state.opacity ?? 1)
          .when(turning && animate, el => el.transition("opacity", 200))
          .children(["right", "left"].map(facing => image(`${ART}/${fishAsset(a, !animate, turning, leader.address, true, facing, choice)}`)
            .absolute().top(0).left(0).size_full().opacity((motion?.state.face ?? "right") === facing ? 1 : 0)))
        : image(`${ART}/${fishAsset(a, !animate, turning, leader.address, false, "right", choice)}`).size_full();
      const fish = div().id(`art-${a.address}`).absolute().top(presentation.top)
        .left(traveling ? (width - travelWidth) / 2 : (width - fishSize) / 2)
        .w(traveling ? travelWidth : fishSize).h(traveling ? travelWidth / 4 : fishSize)
        .opacity(needsYou || !hasAttention ? 1 : 0.84)
        .when(animate, art => art.transition("width", 400).transition("height", 400)
          .transition("left", 400).transition("top", 400).transition("opacity", 400))
        .when(needsYou, el => el.child(image(`${ART}/attention.svg`).id(`attention-${a.address}`)
          .absolute().top((fishSize - haloSize) / 2).left((fishSize - haloSize) / 2).size(haloSize)
          .when(animate, halo => halo.loop("opacity", { from: 0.5, to: 1, period: 3200 }))))
        .child(pose)
        .when(animate && a.status === "done" && this.shimmers.has(a.address), el =>
          el.child(image(`${ART}/shimmer.svg`).id(`shimmer-${a.address}`).absolute()
            .top((fishSize - haloSize) / 2).left((fishSize - haloSize) / 2).size(haloSize)
            .loop("opacity", { from: 0.15, to: 0.9, period: 1200 })));
      return Button.new(`fish-${a.address}`).tab_index(tabIndex++).relative().w(width).h(presentation.targetHeight).flex_none()
        .flex().flex_col().items_center().justify_end().pb(9)
        .border(1).border_color("#00000000").focus(s => s.border_color(tankInk.background))
        .accessibility_label(`${a.title || a.program.name}, ${statusLabel[a.status]}. ${d.join(". ")}. Open agent.`)
        .tooltip(`${a.title || a.program.name}\n${d.join("\n")}\nClick to open agent`)
        .on_hover((hovered, cx) => {
          if (hovered) { this.hovered = a.address; this.inspected = a.address; }
          else if (this.hovered === a.address) this.hovered = null;
          else return;
          cx.notify();
        })
        .on_click(() => { this.inspected = a.address; open(a); })
        .child(fish)
        .child(h_flex().gap(5).items_center().px(5).text_color(tankInk.foreground)
          .child(div().size(6).rounded_full().bg(color))
          .child(div().max_w(width - 24).truncate().text_size(12).font_semibold()
            .child(`${leader !== a ? "↳ " : ""}${a.title || a.program.name}`)))
        .child(div().px(5).text_size(11).text_color(tankInk.foreground).child(statusLabel[a.status]));
    };

    const toggle = (id, label, checked, change) => Switch.new(id).checked(checked).on_change(change)
      .w_full().h(32).flex_none().px(4).flex().items_center().justify_between().rounded(4)
      .border(1).border_color("#00000000").focus(s => s.border_color(t.accent)).hover(s => s.bg(t.hover))
      .accessibility_label(label).child(label)
      .child(div().relative().w(30).h(16).rounded_full().bg(checked ? t.accent : t.border)
        .child(div().absolute().top(2).left(checked ? 16 : 2).size(12).rounded_full().bg(t.foreground)));
    // Keep rows at their readable size: the bounded surface scrolls instead of shrinking them.
    const choices = (id, label, value, items, change) => v_flex().flex_none().gap(4)
      .child(div().text_size(11).text_color(t.muted).child(label))
      .child(RadioGroup.new(id).accessibility_label(label).axis("vertical").flex().flex_col().gap(2)
        .children(items.map(([key, text]) => Radio.new(`${id}-${key}`).checked(value === key).on_change(() => change(key))
          .w_full().h(28).flex_none().px(4).flex().gap(8).items_center().rounded(4)
          .border(1).border_color("#00000000").focus(s => s.border_color(t.accent)).hover(s => s.bg(t.hover))
          .accessibility_label(text)
          .child(div().size(14).rounded_full().border(1).border_color(value === key ? t.accent : t.muted)
            .flex().items_center().justify_center().when(value === key, el => el.child(div().size(6).rounded_full().bg(t.accent))))
          .child(text))));
    const options = Popover.new("aquarium-options").open(this.optionsOpen).anchor("top_right")
      .on_open_change((open, cx) => {
        this.optionsOpen = open;
        if (open) this.pickerTarget = null;
        cx.notify();
      })
      .trigger(this.button("aquarium-options-trigger", "Options ▾", undefined, 1).accessibility_label("Aquarium options"))
      .content(v_flex().id("aquarium-options-scroll")
        .w(Math.min(256, Math.max(0, window.viewport_size().width - 24)))
        .max_h(Math.max(0, window.viewport_size().height - 24)).overflow_y_scrollbar()
        .p(12).gap(12).text_size(12).text_color(t.foreground).bg(t.surface)
        .rounded(8).border(1).border_color(t.border).shadow_lg()
        .child(toggle("aquarium-motion", "Animate aquarium", !paused, checked => setShared("aquarium.paused", !checked)))
        .child(choices("aquarium-arrangement", "Fish arrangement", free, [[true, "Free-floating"], [false, "Organized"]], value => setShared("aquarium.free", value)))
        .child(choices("aquarium-speed", "Free-floating speed", speed, [["slow", "Slow"], ["normal", "Normal"]], value => setShared("aquarium.speed", value)))
        .child(choices("aquarium-turning", "Turning", turning, [[true, "Smooth"], [false, "Instant"]], value => setShared("aquarium.turning", value)))
        .child(toggle("aquarium-bubbles", "Bubbles", bubbles, checked => setShared("aquarium.bubbles", checked)))
        .child(toggle("aquarium-water", "Surface waves", water, checked => setShared("aquarium.water", checked))));

    const candidate = families.find(({ leader, children }) => leader.address === this.inspected ||
      children.some(({ agent }) => agent.address === this.inspected))?.leader
      ?? families.find(({ leader, children }) => leader.address === selected?.address ||
        children.some(({ agent }) => agent.address === selected?.address))?.leader;
    const fishPicker = () => {
      const leader = candidate;
      const key = leader ? familyChoiceKey(leader, nativeSpaces) : null;
      const target = this.pickerTarget;
      const isOpen = Boolean(target);
      const value = isOpen ? savedSpecies(shared(target.key)) : null;
      return Popover.new("aquarium-fish-picker").open(isOpen).anchor("top_left")
        .on_open_change((open, cx) => {
          // Capture identity at opening, never follow hover/focus while editing.
          this.pickerTarget = open && key ? { key, address: leader.address, title: leader.title || leader.address } : null;
          if (open) this.optionsOpen = false;
          cx.notify();
        })
        .trigger(this.button("aquarium-fish-picker-trigger", "Choose fish", undefined)
          .disabled(!key).accessibility_label(`Choose fish for ${target?.title || leader?.title || leader?.address || "no family"}${key ? "" : ": native space unavailable"}`))
        .content(v_flex().id("aquarium-fish-picker-scroll").w(Math.min(260, Math.max(0, window.viewport_size().width - 24)))
          .max_h(Math.max(0, Math.min(420, window.viewport_size().height - 24))).overflow_y_scrollbar()
          .p(12).gap(6).bg(t.surface).text_color(t.foreground).rounded(8)
          .child(div().child(`Fish for ${isOpen ? target.title : leader?.title || leader?.address || "no family"}`))
          .child(RadioGroup.new("aquarium-fish-species").axis("vertical").accessibility_label("Family fish species")
            .flex_none().flex().flex_col().gap(4)
            .children((isOpen ? [null, ...SPECIES] : []).map(species => Radio.new(`aquarium-fish-choice-${species || "automatic"}`)
              .checked(value === species).on_change(() => {
                if (isOpen && this.pickerTarget?.key === target.key) setShared(target.key, species);
              }).h(44).w_full().flex_none().flex().items_center().gap(8).px(6)
              .border(1).border_color(value === species ? t.accent : "#00000000")
              .focus(s => s.border_color(t.accent)).hover(s => s.bg(t.hover))
              .accessibility_label(species ? speciesName(species) : "Automatic")
              .when(Boolean(species), el => el.child(image(`${ART}/${species}.png`).size(38)))
              .child(species ? speciesName(species) : "Automatic")))));
    };

    const schoolTop = (this.controlsHeight ?? 30) + 20;
    const bodyWidth = Math.max(104, this.size.width - 32);
    const bodyHeight = Math.max(178, this.size.height - 68 - schoolTop);
    const floatingSchool = floatingSchoolGeometry(bodyWidth, bodyHeight, families);
    const floats = families.map((family, index) => ({ ...family, layout: floatingSchool.layouts[index] }));
    this.syncMotion(floats, free && animate, speed, turning, cx);
    const schoolView = free
      ? div().relative().w(bodyWidth).h(floatingSchool.height).flex_none()
        .children(floats.map(({ leader, children, layout: g }) => {
          const entry = this.motion.get(leader.address);
          const m = entry.state;
          return (g.stacked ? v_flex() : h_flex()).id(`family-${leader.address}-${entry.version}-${g.top}`).absolute()
            .left(m.to.x).top(g.top + m.to.y).w(g.width).h(g.height).flex_none().gap(8).items_center().justify_center()
            .transition("left", { duration: m.phase === "moving" ? m.duration : 0, easing: "linear" })
            .transition("top", { duration: m.phase === "moving" ? m.duration : 0, easing: "linear" })
            .child(drawFish(leader, g.leaderWidth, 1, leader))
            .when(children.length > 0, el => el.child(h_flex().w(g.broodWidth).flex_none().flex_wrap().gap(4).justify_center()
              .children(children.map(({ agent, depth }) => drawFish(agent, 96, depth > 1 ? 0.48 : 0.6, leader)))));
        }))
      : h_flex().w(Math.max(bodyWidth, lane)).flex_none().flex_wrap().justify_around().items_start().children(families.map(({ leader, children }) => {
          const stacked = immersive || lane < 400;
          const leaderWidth = children.length && !stacked ? Math.floor(lane * 0.58) - 4 : lane;
          const broodWidth = stacked ? lane : lane - leaderWidth - 8;
          return (stacked ? v_flex() : h_flex()).w(lane).flex_none().min_h(geometry.height).gap(8).items_center().justify_center()
            .child(drawFish(leader, leaderWidth, 1, leader))
            .when(children.length > 0, el => el.child(h_flex().w(broodWidth).flex_none().flex_wrap().justify_center().gap(4)
              .children(children.map(({ agent, depth }) =>
                drawFish(agent, Math.max(104, Math.min(220, broodWidth / 2 - 2)), depth > 1 ? 0.48 : 0.6, leader)))));
        }));

    const waterHeight = Math.max(120, this.size.height - 58);
    const surface = surfaceGeometry(this.size.width);
    const tank = div().relative().flex_1().min_h(0).overflow_hidden()
      .when(water, el => el.child(h_flex().id("surface-wave").absolute().top(0).left(-surface.travel)
        .w(surface.tileWidth * surface.count).h(surface.height)
        .children(Array.from({ length: surface.count }, () => image(`${ART}/surface.svg`)
          .w(surface.tileWidth).h(surface.height).flex_none()))
        .when(animate, wave => wave.loop("left", { from: -surface.travel, to: 0, period: 9000 }))))
      .when(bubbles, el => el.children(["left", "right"].map(side =>
        image(`${ART}/bubbles-${side}.${animate ? "webp" : "png"}`).absolute().top(0)
          .w(waterHeight / 6).h(waterHeight)
          .when(side === "left", stream => stream.left(0))
          .when(side === "right", stream => stream.right(0)))))
      .child(div().absolute().top(schoolTop).bottom(10).left(16).right(16)
        .id("school-scroll").overflow_scrollbar().child(schoolView))

      .when(!school.length, el => el.child(v_flex().absolute().top(90).left(24).gap(6)
        .child(div().text_size(17).child("A little quiet in here."))
        .child(div().text_size(13).text_color(t.muted).child("Start an agent from the + menu in Workspace. Its fish will appear here."))));

    const controls = h_flex().id("aquarium-controls").absolute().top(10).left(16).right(18)
      .flex_wrap().justify_end().gap(8).items_center()
      .on_size_change((size, cx) => {
        if (Math.abs(size.height - (this.controlsHeight ?? 30)) > 1) {
          this.controlsHeight = size.height;
          cx.notify();
        }
      })
      .child(this.button("aquarium-mode", immersive ? "Workspace" : "Immersive", () => { this.suspended = true; this.stopMotion(); run("layout.switch", { name: immersive ? "aquarium" : "aquarium-immersive" }); run("aquarium.resume"); }))
      .child(fishPicker()).child(options);
    return v_flex().id("aquarium-root").size_full().text_color(t.foreground)
      .on_size_change((size, cx) => {
        if (Math.abs(size.width - this.size.width) > 1 || Math.abs(size.height - this.size.height) > 1) {
          this.size = size;
          cx.notify();
        }
      })
      .child(tank.child(controls))
      .child(v_flex().h(58).flex_none().px(18).py(7).gap(3).bg(t.chrome).border_t(1).border_color(t.border)
        .child(div().text_size(12).font_semibold().truncate().child(selected
          ? [selected.program.name, selected.space_name, selected.tab_name, !selected.space_name && !selected.tab_name ? "Scope: not reported" : null].filter(Boolean).join("  /  ")
          : "Your agents, a little more alive."))
        .child(div().text_size(11).text_color(t.muted).truncate().child(detail
          ? detail.join("   •   ")
          : "Hover a fish for details. Click to open its terminal.")));
  }
}
