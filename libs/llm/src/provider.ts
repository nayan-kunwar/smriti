/** Text completion port for summarization and profile extraction. */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(prompt: string): Promise<string>;
}
