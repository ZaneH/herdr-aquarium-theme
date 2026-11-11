import { View, div, image } from "gpui-kit";
import { h_flex, v_flex, Button } from "gpui-base";
import { agents, terminals, theme, run, shared, setShared, props, focused, nextCommand } from "herdr";
import { detailsFor, schoolGeometry, fishAsset } from "./model.js";

const ART = "mods/aquarium/assets";
const statusLabel = { working: "Working", blocked: "Needs you", done: "Finished", idle: "Resting" };

export default class Aquarium extends View {
  init(_props, cx) {
    this.hovered = null;
    this.size = { width: 900, height: 500 };
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        if (command === "motion") setShared("aquarium.paused", shared("aquarium.paused") === false);
        if (command === "turning") setShared("aquarium.turning", shared("aquarium.turning") === false);
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

  render() {
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
    const selected = school.find(a => a.address === this.hovered)
      ?? school.find(a => a.focused) ?? school[0];
    const detail = selected ? detailsFor(selected, all.find(a => a.address === selected.address)) : null;
    const geometry = schoolGeometry(Math.max(120, this.size.width - 32), Math.max(170, this.size.height - 140), school.length, immersive);
    const lane = geometry.lane;
    const open = a => {
      run("agent.focus", { terminal: a.address });
      if (immersive) run("layout.select", { stack: "aquarium-view", child: "terminal-view" });
    };

    const tank = div().relative().flex_1().min_h(0).overflow_hidden()
      .child(h_flex().absolute().top(10).left(18).right(18).gap(8).flex_wrap().items_center()
        .child(div().text_size(22).font_semibold().child("The aquarium"))
        .child(div().text_size(12).text_color(t.muted).child(`${school.length} ${school.length === 1 ? "agent" : "agents"}`))
        .child(div().flex_1())
        .child(this.button("aquarium-mode", immersive ? "Workspace" : "Immersive", () => run("layout.switch", { name: immersive ? "aquarium" : "aquarium-immersive" })))
        .child(this.button("aquarium-motion", paused ? "Enable swimming" : "Pause swimming", () => setShared("aquarium.paused", !paused), 1))
        .child(this.button("aquarium-turning", turning ? "Turning: smooth" : "Turning: instant", () => setShared("aquarium.turning", !turning), 2)))
      .child(div().absolute().top(70).bottom(10).left(16).right(16)
        .id("school-scroll").overflow_y_scrollbar()
        .child(h_flex().flex_wrap().justify_around().items_start().children(school.map((a, i) => {
          const d = detailsFor(a, all.find(terminal => terminal.address === a.address));
          const color = t[a.status] ?? t.muted;
          const moving = !paused && a.status !== "done" && a.status !== "blocked";
          const artHeight = lane / 4;
          const fish = image(`${ART}/${fishAsset(a, paused, turning)}`).w(moving ? lane : 108).h(moving ? artHeight : 108);
          return h_flex().w(lane).h(Math.max(artHeight + 40, geometry.height)).items_center().justify_center()
            .child(Button.new(`fish-${a.address}`).tab_index(i + 3).relative().w(lane).h(Math.max(108, artHeight) + 38).flex_none()
              .flex().flex_col().items_center().justify_end().pb(9).rounded(14)
              .border(1).border_color("#00000000").focus(s => s.border_color(t.accent))
              .hover(s => s.bg("#143d4d66").border_color(t.accent))
              .accessibility_label(`${a.title || a.program.name}, ${statusLabel[a.status]}. ${d.join(". ")}. Open agent.`)
              .tooltip(`${a.title || a.program.name}\n${d.join("\n")}\nClick to open agent`)
              .on_hover((hovered, cx) => { this.hovered = hovered ? a.address : null; cx.notify(); })
              .on_click(() => open(a))
              .child(div().absolute().top(0).left(moving ? 0 : (lane - 108) / 2).child(fish))
              .child(h_flex().gap(5).items_center()
                .child(div().size(6).rounded_full().bg(color))
                .child(div().max_w(lane - 24).truncate().text_size(12).font_semibold().child(a.title || a.program.name)))
              .child(div().text_size(11).text_color(color).child(statusLabel[a.status])));
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
