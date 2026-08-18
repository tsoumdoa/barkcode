export type ProgressStatus = "processing" | "success" | "failed";

export type ProgressData = {
	current: number;
	total: number;
	fileName: string;
	elapsedMs: number;
};

export type MessageFormatter = (message: string) => string;
