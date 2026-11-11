import { View, div, image } from "gpui-kit";
import { h_flex, v_flex, Button } from "gpui-base";
import { agents, terminals, theme, run, shared, setShared, props, focused, nextCommand } from "herdr";
import { detailsFor, schoolGeometry, fishAsset, newCompletions, schoolFamilies } from "./model.js";

const ART = "mods/aquarium/assets";
const statusLabel = { working: "Working", blocked: "Needs you", done: "Finished", idle: "Resting" };

export default class Aquarium extends View {
  init(_props, cx) {
    this.hovered = null;
    this.size = { width: 900, height: 500 };
    this.previous = new Map();
    this.shimmers = new Map();
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        if (command === "motion") setShared("aquarium.paused", shared("aquarium.paused") === false);
        if (command === "turning") setShared("aquarium.turning", shared("aquarium.turning") === false);
        if (command === "bubbles") setShared("aquarium.bubbles", shared("aquarium.bubbles") === false);
        if (command === "water") setShared("aquarium.water", shared("aquarium.water") === false);
      }
    });
  }

  button(id, label, action, index = 0) {
    const t = theme();
    return Button.new(id).tab_index(index).px(10).py(5).rounded(6).text_size(12)
      .text_color(t.foreground).bg(t.surface).border(1).border_color("#00000000")
      .focus(s => s.border_color(t.accent)).hover(s => s.bg(t.hover))
      .accessibility_label(label).on_click(action).child(label);
  }

  render(cx) {
    const t = theme();
    const immersive = Boolean(props()?.immersive);
    const school = agents();
    if (props()?.terminal) {
      const agent = school.find(a => a.address === focused()?.agent);
      return h_flex().size_full().px(14).gap(12).items_center().bg(t.chrome)
        .child(this.button("back-to-water", "Back to aquarium", () => run("layout.select", { stack: "aquarium-view", child: "tank-view" })))
        .child(div().flex_1().truncate().text_size(13).text_color(t.foreground).child(agent?.title || "Agent terminal"))
        .child(this.button("back-to-workspace", "Workspace", () => run("layout.switch", { name: "aquarium" }), 1));
    }

    const all = terminals();
    const paused = shared("aquarium.paused") !== false;
    const turning = shared("aquarium.turning") !== false;
    const bubbles = shared("aquarium.bubbles") !== false;
    const water = shared("aquarium.water") !== false;
    for (const agent of newCompletions(this.previous, school)) {
      if (paused) continue;
      const token = {};
      this.shimmers.set(agent.address, token);
      // One expiry per completion; native opacity animation draws every intervening frame.
      cx.timer.after(3000, cx => {
        if (this.shimmers.get(agent.address) === token) {
          this.shimmers.delete(agent.address);
          cx.notify();
        }
      });
    }
    this.previous = new Map(school.map(agent => [agent.address, agent.status]));
    for (const address of this.shimmers.keys()) {
      if (this.previous.get(address) !== "done") this.shimmers.delete(address);
    }
    const selected = school.find(a => a.address === this.hovered)
      ?? school.find(a => a.focused) ?? school[0];
    const detail = selected ? detailsFor(selected, all.find(a => a.address === selected.address)) : null;
    const families = schoolFamilies(school, all);
    const geometry = schoolGeometry(Math.max(120, this.size.width - 32), Math.max(170, this.size.height - 140), families.length, immersive);
    const lane = geometry.lane;
    const open = a => {
      run("agent.focus", { terminal: a.address });
      if (immersive) run("layout.select", { stack: "aquarium-view", child: "terminal-view" });
    };

    let tabIndex = 5;
    const drawFish = (a, width, scale, leader) => {
      const d = detailsFor(a, all.find(terminal => terminal.address === a.address));
      if (leader !== a) d.push(`Fish family: ${leader.title || leader.program.name}`);
      const color = t[a.status] ?? t.muted;
      const moving = !paused && a.status !== "done" && a.status !== "blocked";
      const needsYou = a.status === "blocked";
      const fishSize = Math.min(width - 8, (needsYou ? 140 : 108) * scale);
      const travelWidth = width * Math.min(1, scale / 0.6);
      const artHeight = Math.max(fishSize, travelWidth / 4);
      const haloSize = 180 * scale;
      const fish = div().absolute().top(0).left(moving ? (width - travelWidth) / 2 : (width - fishSize) / 2)
        .w(moving ? travelWidth : fishSize).h(moving ? travelWidth / 4 : fishSize)
        .when(needsYou, el => el.child(image(`${ART}/attention.svg`).id(`attention-${a.address}`)
          .absolute().top((fishSize - haloSize) / 2).left((fishSize - haloSize) / 2).size(haloSize)
          .when(!paused, halo => halo.loop("opacity", { from: 0.5, to: 1, period: 3200 }))))
        .child(image(`${ART}/${fishAsset(a, paused, turning, leader.address)}`).size_full())
        .when(!paused && a.status === "done" && this.shimmers.has(a.address), el =>
          el.child(image(`${ART}/shimmer.svg`).id(`shimmer-${a.address}`).absolute()
            .top((fishSize - haloSize) / 2).left((fishSize - haloSize) / 2).size(haloSize)
            .loop("opacity", { from: 0.15, to: 0.9, period: 1200 })))
        .when(needsYou && !paused, el => el.id(`front-glass-${a.address}`).loop("top", { from: 0, to: 6 * scale, period: 3200 }));
      return Button.new(`fish-${a.address}`).tab_index(tabIndex++).relative().w(width).h(artHeight + 38).flex_none()
        .flex().flex_col().items_center().justify_end().pb(9).rounded(14)
        .border(1).border_color("#00000000").focus(s => s.border_color(t.accent))
        .hover(s => s.bg("#143d4d66").border_color(t.accent))
        .accessibility_label(`${a.title || a.program.name}, ${statusLabel[a.status]}. ${d.join(". ")}. Open agent.`)
        .tooltip(`${a.title || a.program.name}\n${d.join("\n")}\nClick to open agent`)
        .on_hover((hovered, cx) => { this.hovered = hovered ? a.address : null; cx.notify(); })
        .on_click(() => open(a))
        .child(fish)
        .child(h_flex().gap(5).items_center()
          .child(div().size(6).rounded_full().bg(color))
          .child(div().max_w(width - 24).truncate().text_size(12).font_semibold()
            .child(`${leader !== a ? "↳ " : ""}${a.title || a.program.name}`)))
        .child(div().text_size(11).text_color(color).child(statusLabel[a.status]));
    };

    const waterHeight = Math.max(120, this.size.height - 58);
    const tank = div().relative().flex_1().min_h(0).overflow_hidden()
      .when(water, el => el.child(image(`${ART}/surface.svg`).id("surface-wave").absolute().top(0).left(-20)
        .w(this.size.width + 80).h(36)
        .when(!paused, wave => wave.loop("left", { from: -40, to: 0, period: 9000 }))))
      .when(bubbles, el => el.children(["left", "right"].map(side =>
        image(`${ART}/bubbles-${side}.${paused ? "png" : "webp"}`).absolute().top(0)
          .w(waterHeight / 6).h(waterHeight)
          .when(side === "left", stream => stream.left(0))
          .when(side === "right", stream => stream.right(0)))))
      .child(h_flex().absolute().top(10).left(18).right(18).gap(8).flex_wrap().items_center()
        .child(div().text_size(22).font_semibold().child("The aquarium"))
        .child(div().text_size(12).text_color(t.muted).child(`${school.length} ${school.length === 1 ? "agent" : "agents"}`))
        .child(div().flex_1())
        .child(this.button("aquarium-mode", immersive ? "Workspace" : "Immersive", () => run("layout.switch", { name: immersive ? "aquarium" : "aquarium-immersive" })))
        .child(this.button("aquarium-motion", paused ? "Enable motion" : "Pause motion", () => setShared("aquarium.paused", !paused), 1))
        .child(this.button("aquarium-turning", turning ? "Turning: smooth" : "Turning: instant", () => setShared("aquarium.turning", !turning), 2))
        .child(this.button("aquarium-bubbles", bubbles ? "Bubbles: on" : "Bubbles: off", () => setShared("aquarium.bubbles", !bubbles), 3))
        .child(this.button("aquarium-water", water ? "Water: on" : "Water: off", () => setShared("aquarium.water", !water), 4)))
      .child(div().absolute().top(70).bottom(10).left(16).right(16)
        .id("school-scroll").overflow_y_scrollbar()
        .child(h_flex().flex_wrap().justify_around().items_start().children(families.map(({ leader, children }) => {
          const stacked = immersive || lane < 400;
          const leaderWidth = children.length && !stacked ? Math.floor(lane * 0.58) - 4 : lane;
          const broodWidth = stacked ? lane : lane - leaderWidth - 8;
          return (stacked ? v_flex() : h_flex()).w(lane).min_h(geometry.height).gap(8).items_center().justify_center()
            .child(drawFish(leader, leaderWidth, 1, leader))
            .when(children.length > 0, el => el.child(h_flex().w(broodWidth).flex_wrap().justify_center().gap(4)
              .children(children.map(({ agent, depth }) =>
                drawFish(agent, Math.max(104, Math.min(220, broodWidth / 2 - 2)), depth > 1 ? 0.48 : 0.6, leader)))));
        }))))
      .when(!school.length, el => el.child(v_flex().absolute().top(90).left(24).gap(6)
        .child(div().text_size(17).child("A little quiet in here."))
        .child(div().text_size(13).text_color(t.muted).child("Start an agent from the + menu in Workspace. Its fish will appear here."))));

    return v_flex().id("aquarium-root").size_full().text_color(t.foreground)
      .on_size_change((size, cx) => {
        if (Math.abs(size.width - this.size.width) > 1 || Math.abs(size.height - this.size.height) > 1) {
          this.size = size;
          cx.notify();
        }
      })
      .child(tank)
      .child(v_flex().h(58).flex_none().px(18).py(7).gap(3).bg(t.chrome).border_t(1).border_color(t.border)
        .child(div().text_size(12).font_semibold().truncate().child(selected
          ? `${selected.program.name}  /  ${selected.space_name}  /  ${selected.tab_name}`
          : "Your agents, a little more alive."))
        .child(div().text_size(11).text_color(t.muted).truncate().child(detail
          ? detail.join("   •   ")
          : "Hover a fish for details. Click to open its terminal.")));
  }
}
