/**
 * TUI launcher — dynamically imports Ink so the default command stays lightweight.
 */

import React from "react";
import { render } from "ink";

interface TuiArgs {
  since?: string;
  until?: string;
  last?: string;
  source?: string;
}

export async function runTui(_args: TuiArgs): Promise<void> {
  const { App } = await import("./app.js");
  render(React.createElement(App));
}
