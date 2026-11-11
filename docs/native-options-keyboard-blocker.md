# Native Options keyboard focus: host handoff

Issue #4, base `de3be2f`. No production workaround is applied: retain native Switch, Radio, RadioGroup and Popover, and one focus stop per control. Native keyboard acceptance remains open.

## Supported API gap

Authority inspected: installed `~/.config/herdr-app/gpui-kit.d.ts`, generated for gpui-shell **0.7.1** (not committed because the runtime regenerates it).

- Lines 1264–1273 expose `hover`, `active`, `focus`; the shared prototype does **not** guarantee component suitability (header, lines 27–28).
- `track_focus` contract, lines 1010–1024: Switch and Link own private handles; supplied handles are reported and dropped. Radio and Button accept handles.
- `FocusHandle`, lines 20406–20412, exposes only `focus`, `is_focused`, `release`. There is no descendant-focus query or focus subscription in this contract; no `focus_within` builder is declared.
- Switch contract (20699–20700): controlled, **no styling**. The issue #4 coordinator's prior native materialization reported that Switch state styles are ignored. This follow-up does not claim a fresh native reproduction or actual keyboard observation.
- Radio/RadioGroup (20938–20964): controlled selection; group axis is semantic, not keyboard navigation. Popover (21058–21073) owns opening, dismissal and focus transfer/return; preserve those mechanisms.
- Shipped `mods/new-menu/main.js:25–63` uses an owned handle on a plain wrapper and explicit shortcut handling. It does not demonstrate styling focus of a private-handle native Switch. The shipped settings view similarly uses its own wrapper handle (`frame/settings/main.js:878`). Neither establishes a supported descendant-focus styling solution.

A wrapper with its own focus handle is not a solution: it either adds another stop or reports the wrapper's focus, not the native switch's. Hover/checked styling cannot stand in for keyboard focus. Key-event heuristics cannot reliably observe focus entry, exit or programmatic transfer.

## Minimal host reproduction

Use this standalone view in the host maintainer's existing gpui-shell fixture runner; no Herdr state, timers, artwork or app preferences are needed. This is a reproduction recipe, not a claim that it was run here.

```js
import { View, div } from "gpui-kit";
import { v_flex, Button, Switch, Radio, RadioGroup, Popover } from "gpui-base";
export default class NativeFocusRepro extends View {
  init() { this.open = false; this.on = false; this.choice = false; }
  render() {
    return Popover.new("focus-repro").open(this.open)
      .on_open_change((open, cx) => { this.open = open; cx.notify(); })
      .trigger(Button.new("open").child("Options")
        .border(2).border_color("#777777")
        .focus(s => s.border_color("#ff00ff")))
      .content(v_flex().w(240).p(12).gap(8).bg("#182838")
        .child(Switch.new("switch").checked(this.on)
          .on_change((on, cx) => { this.on = on; cx.notify(); })
          .h(36).border(2).border_color("#777777")
          .focus(s => s.border_color("#ff00ff"))
          .accessibility_label("Native switch")
          .child(`Native switch: ${this.on ? "on" : "off"}`))
        .child(RadioGroup.new("choices").axis("vertical").flex().flex_col()
          .children([false, true].map(value => Radio.new(`choice-${value}`)
            .checked(this.choice === value)
            .on_change((_, cx) => { this.choice = value; cx.notify(); })
            .h(32).border(2).border_color("#777777")
            .focus(s => s.border_color("#ff00ff"))
            .accessibility_label(`Choice ${value}`).child(`Choice ${value}`))))
        .child(div().child("Magenta border must follow actual keyboard focus.")));
  }
}
```

Host action: replay the fixture and confirm the Switch state-style diagnostic; then wire native Switch focus styling to its existing focusable element/private handle, or expose a documented supported way to style that exact handle's focus without another tab stop. Add host keyboard coverage for focus entry/exit and rerender while focused. Do not require a mod to implement traversal or activation. Clarify which state-style builders Switch supports in generated declarations/diagnostics.

## Manual keyboard acceptance (after host fix)

Human-driven only; record host build/platform and keyboard-navigation settings. Keep pointer away from the controls so hover cannot be mistaken for focus.

1. Tab to Aquarium Options. Verify a visible focus indicator, then open with native keyboard activation (Space/Enter; record each result). Verify focus enters the surface, not an invisible or duplicate stop.
2. Traverse forward and backward using Tab/Shift-Tab. Record the actual sequence: Animate aquarium; arrangement choices; speed choices; turning choices; Bubbles; Surface waves. Every reachable native control must show an unambiguous focus indicator; leaving it must remove that indicator. Each switch has exactly one stop; no wrapper stops. Do not assume radio roving/arrow behavior from `axis` metadata: record actual radio Tab and arrow behavior separately.
3. Space-toggle each switch both ways. Confirm exactly one change per activation and that the focused control stays visibly focused after rerender. Activate each radio choice; exactly one choice per group remains selected, with selection visually distinct from focus. Record Enter behavior separately rather than assuming it is supported for every primitive.
4. Escape from a switch and from a radio must close the surface and visibly return focus to Options. Reopen, dismiss with a manual outside press, and verify the documented return behavior. Reopen again to check no stale focus indicator remains.
5. In a manually sized short window, traverse to the last input and back: each focused row must be visible/readable, scroll into view as needed, and remain operable without shrinking or clipping. Record failures rather than injecting a scroll/key workaround.
6. Change every setting in both directions, switch layout copies, then reload: values and effects must agree across copies/reload. Verify focus is never represented by the selected value alone.

No checkbox in issue #4 is closed by static contracts, builder mocks, or native materialization alone. This investigation used no live keyboard/pointer automation, screenshots, installation, preference changes or GUI provisioning.
