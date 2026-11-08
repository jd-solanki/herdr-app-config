import { div, type Color, type Context, type KeyEvent } from "gpui-kit";
import { Input, InputState, Popup, v_flex } from "gpui-base";
import { lastWord, searchSuggestions, wantsLabels } from "./suggestions.ts";

const SUGGESTIONS_SHOWN = 8;

export type SearchBoxOptions = {
  query: string;
  qualifiers: () => string[];
  // The label names known now; needLabels asks for them once the last word is label:.
  labels: () => string[];
  needLabels?: (cx: Context) => void;
  // A finished query, from Enter with no suggestion showing.
  submit: (query: string, cx: Context) => void;
  height?: number;
};

// GitHub's search box: completes qualifiers and label names in a popup under the input.
// Not a View: a mod's view creates it in init and draws it with render().
export class SearchBox {
  readonly input: InputState;
  private readonly options: SearchBoxOptions;
  private open: boolean;
  private index: number;

  constructor(options: SearchBoxOptions) {
    this.options = options;
    this.open = false;
    this.index = 0;
    this.input = InputState.new({ placeholder: "GitHub search query" });
    this.input.set_value(options.query);
    this.input.on("submit", (_e, cx) => this.submit(cx));
    this.input.on("change", (_e, cx) => this.show(cx));
  }

  // A query set from outside (a preset, a remembered view) closes the suggestions.
  set(query: string) {
    this.input.set_value(query);
    this.open = false;
  }

  value() {
    return this.input.value();
  }

  close() {
    this.open = false;
  }

  suggestions() {
    if (!this.open) return [];
    const { qualifiers, labels } = this.options;
    return searchSuggestions(this.input.value(), qualifiers(), labels()).slice(
      0,
      SUGGESTIONS_SHOWN,
    );
  }

  // Enter finishes the picked suggestion first, as on GitHub; with no suggestion showing, Enter searches.
  private submit(cx: Context) {
    const suggestions = this.suggestions();
    if (suggestions.length) this.accept(suggestions[this.index], cx);
    else {
      this.open = false;
      this.options.submit(this.input.value(), cx);
    }
  }

  private show(cx: Context) {
    this.open = true;
    this.index = 0;
    if (wantsLabels(this.input.value())) this.options.needLabels?.(cx);
    cx.notify();
  }

  private accept(word: string, cx: Context) {
    const query = this.input.value();
    const completed = query.slice(0, query.length - lastWord(query).length) + word;
    // A bare qualifier like "label:" still needs its value, so the popup stays for it.
    this.input.set_value(word.endsWith(":") ? completed : `${completed} `);
    this.input.focus();
    this.show(cx);
  }

  private dismiss(cx: Context) {
    if (!this.open) return;
    this.open = false;
    cx.notify();
  }

  // ↑ and ↓ pick, Tab accepts and Esc closes; Enter is the input's submit.
  private steer(event: KeyEvent, suggestions: string[], cx: Context) {
    if (!suggestions.length) return;
    const count = suggestions.length;
    if (event.key === "down") this.index = (this.index + 1) % count;
    else if (event.key === "up") this.index = (this.index - 1 + count) % count;
    else if (event.key === "tab")
      return this.stopAfter(cx, () => this.accept(suggestions[this.index], cx));
    else if (event.key === "escape") return this.stopAfter(cx, () => this.dismiss(cx));
    else return;
    cx.notify();
    cx.stop_propagation();
  }

  private stopAfter(cx: Context, act: () => void) {
    act();
    cx.stop_propagation();
  }

  render(colors: Record<string, Color>) {
    const suggestions = this.suggestions();
    const box = div()
      .h(this.options.height ?? 34)
      .px(10)
      .flex()
      .items_center()
      .rounded(7)
      .border(1)
      .border_color(colors.border)
      .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(colors.foreground));
    return (
      div()
        .id("search")
        .flex_none()
        .on_key_down((event, cx) => this.steer(event, suggestions, cx))
        // Not the input's blur: a press on non-focusable space may not move focus.
        .on_mouse_down_out((_e, cx) => this.dismiss(cx))
        .child(
          Popup.new("search-suggestions", box)
            .anchor("top_left")
            .when(suggestions.length > 0, (popup) =>
              popup.content(this.suggestionList(suggestions, colors)),
            ),
        )
    );
  }

  private suggestionList(suggestions: string[], colors: Record<string, Color>) {
    return v_flex()
      .id("suggestion-list")
      .min_w(260)
      .p(4)
      .gap(2)
      .rounded(8)
      .border(1)
      .border_color(colors.border)
      .bg(colors.surface)
      .text_size(12)
      .children(
        suggestions.map((word, index) =>
          div()
            .id(`suggestion-${index}`)
            .h(26)
            .px(8)
            .flex()
            .items_center()
            .rounded(5)
            .when(index === this.index, (row) => row.bg(colors.hover))
            .hover((style) => style.bg(colors.hover))
            // Mouse down, not click: the press must land before the input can lose focus.
            .on_mouse_down("left", (_e, cx) => {
              cx.stop_propagation();
              this.accept(word, cx);
            })
            .child(word),
        ),
      );
  }
}
