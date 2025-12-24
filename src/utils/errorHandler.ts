export enum ErrorCategory {
	DATABASE = "database",
	API = "api",
	CALCULATION = "calculation",
	VALIDATION = "validation",
	NETWORK = "network",
	SYSTEM = "system",
	UNKNOWN = "unknown",
}

export enum ErrorSeverity {
	LOW = "low",
	MEDIUM = "medium",
	HIGH = "high",
	CRITICAL = "critical",
}

export interface ErrorContext {
	[key: string]: unknown;
}

export class CaiSenError extends Error {
	public readonly category: ErrorCategory;
	public readonly severity: ErrorSeverity;
	public readonly context: ErrorContext;
	public readonly timestamp: number;
	public readonly retryable: boolean;

	constructor(
		message: string,
		category: ErrorCategory = ErrorCategory.UNKNOWN,
		severity: ErrorSeverity = ErrorSeverity.MEDIUM,
		context: ErrorContext = {},
		retryable: boolean = false,
	) {
		super(message);
		this.name = "CaiSenError";
		this.category = category;
		this.severity = severity;
		this.context = context;
		this.timestamp = Date.now();
		this.retryable = retryable;
		Object.setPrototypeOf(this, CaiSenError.prototype);
	}

	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			message: this.message,
			category: this.category,
			severity: this.severity,
			context: this.context,
			timestamp: this.timestamp,
			retryable: this.retryable,
			stack: this.stack,
		};
	}
}

export class DatabaseError extends CaiSenError {
	constructor(message: string, context: ErrorContext = {}) {
		super(message, ErrorCategory.DATABASE, ErrorSeverity.HIGH, context, true);
		this.name = "DatabaseError";
	}
}

export class ApiError extends CaiSenError {
	constructor(message: string, context: ErrorContext = {}) {
		super(message, ErrorCategory.API, ErrorSeverity.MEDIUM, context, true);
		this.name = "ApiError";
	}
}

export class CalculationError extends CaiSenError {
	constructor(message: string, context: ErrorContext = {}) {
		super(message, ErrorCategory.CALCULATION, ErrorSeverity.MEDIUM, context, false);
		this.name = "CalculationError";
	}
}

export class ValidationError extends CaiSenError {
	constructor(message: string, context: ErrorContext = {}) {
		super(message, ErrorCategory.VALIDATION, ErrorSeverity.LOW, context, false);
		this.name = "ValidationError";
	}
}

export class NetworkError extends CaiSenError {
	constructor(message: string, context: ErrorContext = {}) {
		super(message, ErrorCategory.NETWORK, ErrorSeverity.MEDIUM, context, true);
		this.name = "NetworkError";
	}
}

export class SystemError extends CaiSenError {
	constructor(message: string, context: ErrorContext = {}) {
		super(message, ErrorCategory.SYSTEM, ErrorSeverity.CRITICAL, context, false);
		this.name = "SystemError";
	}
}

export interface RetryConfig {
	maxAttempts: number;
	initialDelay: number;
	maxDelay: number;
	backoffMultiplier: number;
	retryableErrors: ErrorCategory[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxAttempts: 3,
	initialDelay: 1000,
	maxDelay: 10000,
	backoffMultiplier: 2,
	retryableErrors: [ErrorCategory.DATABASE, ErrorCategory.API, ErrorCategory.NETWORK],
};

export async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	config: Partial<RetryConfig> = {},
): Promise<T> {
	const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
	let lastError: Error | CaiSenError | null = null;
	let delay = finalConfig.initialDelay;

	for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;

			if (error instanceof CaiSenError) {
				if (!error.retryable || !finalConfig.retryableErrors.includes(error.category)) {
					throw error;
				}
			} else if (!(error instanceof Error)) {
				throw error;
			}

			if (attempt < finalConfig.maxAttempts) {
				await new Promise((resolve) => setTimeout(resolve, delay));
				delay = Math.min(delay * finalConfig.backoffMultiplier, finalConfig.maxDelay);
			}
		}
	}

	throw lastError;
}

export function wrapError(error: unknown, message: string, context?: ErrorContext): CaiSenError {
	if (error instanceof CaiSenError) {
		return error;
	}

	if (error instanceof Error) {
		const category = inferErrorCategory(error);
		const severity = inferErrorSeverity(error);
		return new CaiSenError(message, category, severity, { ...context, originalError: error.message, originalStack: error.stack });
	}

	return new CaiSenError(message, ErrorCategory.UNKNOWN, ErrorSeverity.MEDIUM, { ...context, originalError: String(error) });
}

function inferErrorCategory(error: Error): ErrorCategory {
	const message = error.message.toLowerCase();
	if (message.includes("database") || message.includes("sql") || message.includes("db")) {
		return ErrorCategory.DATABASE;
	}
	if (message.includes("network") || message.includes("connection") || message.includes("timeout")) {
		return ErrorCategory.NETWORK;
	}
	if (message.includes("api") || message.includes("http") || message.includes("request")) {
		return ErrorCategory.API;
	}
	if (message.includes("validation") || message.includes("invalid") || message.includes("required")) {
		return ErrorCategory.VALIDATION;
	}
	if (message.includes("calculation") || message.includes("compute") || message.includes("math")) {
		return ErrorCategory.CALCULATION;
	}
	return ErrorCategory.UNKNOWN;
}

function inferErrorSeverity(error: Error): ErrorSeverity {
	const message = error.message.toLowerCase();
	if (message.includes("critical") || message.includes("fatal") || message.includes("severe")) {
		return ErrorSeverity.CRITICAL;
	}
	if (message.includes("high") || message.includes("urgent")) {
		return ErrorSeverity.HIGH;
	}
	if (message.includes("low") || message.includes("minor")) {
		return ErrorSeverity.LOW;
	}
	return ErrorSeverity.MEDIUM;
}

export interface ErrorRecoveryStrategy {
	canRecover: (error: CaiSenError) => boolean;
	recover: (error: CaiSenError) => Promise<unknown>;
}

export class ErrorHandler {
	private strategies: Map<ErrorCategory, ErrorRecoveryStrategy[]> = new Map();

	registerStrategy(category: ErrorCategory, strategy: ErrorRecoveryStrategy): void {
		if (!this.strategies.has(category)) {
			this.strategies.set(category, []);
		}
		this.strategies.get(category)!.push(strategy);
	}

	async handleError(error: unknown, context?: ErrorContext): Promise<unknown> {
		const wrappedError = error instanceof CaiSenError ? error : wrapError(error, "Unhandled error", context);

		const strategies = this.strategies.get(wrappedError.category) || [];

		for (const strategy of strategies) {
			if (strategy.canRecover(wrappedError)) {
				try {
					return await strategy.recover(wrappedError);
				} catch (recoveryError) {
					console.error(`Error recovery failed: ${recoveryError}`);
				}
			}
		}

		throw wrappedError;
	}
}

export const globalErrorHandler = new ErrorHandler();
