export type CommandResult = {
	success: boolean;
	output?: string;
	error?: string;
	durationMs?: number;
};

export type BatchSummary = {
	total: number;
	succeeded: number;
	failed: number;
	skipped: number;
	durationMs: number;
};

export type FileStatus = "pending" | "processing" | "success" | "failed" | "skipped";

export type FileMapping = {
	inputPath: string;
	fileName: string;
	status: FileStatus;
	error?: string;
};

export type BatchProcessResult = {
	mappings: FileMapping[];
	summary: BatchSummary;
};

export type BatchProgress = {
	succeeded: number;
	failed: number;
	completedCount: number;
};
