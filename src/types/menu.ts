import type { BarkCommand } from "./config";

export type MenuAction =
	| { type: "exit" }
	| { type: "run"; command: BarkCommand; files: string[] };

export type MenuChoice = {
	name: string;
	value: string;
	description?: string;
};
