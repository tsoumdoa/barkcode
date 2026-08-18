export type CommandResult = {
	success: boolean;
	error?: string;
};

export type BatchSummary = {
	total: number;
	succeeded: number;
	failed: number;
	durationMs: number;
};

export type FileStatus = "pending" | "processing" | "success" | "failed";

export type FileMapping = {
	inputPath: string;
	fileName: string;
	status: FileStatus;
	error?: string;
};

export type BatchProgress = {
	succeeded: number;
	failed: number;
	completedCount: number;
};
