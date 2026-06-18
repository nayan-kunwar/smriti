import type { UserProfile } from '@smriti/shared-types';
import { buildRollingSummary } from './summarization';
import { deriveProfile } from './profile';

export interface TextCompleter {
  complete(prompt: string): Promise<string>;
}

const PROFILE_JSON_HINT =
  'Respond with JSON only: {"skills": string[], "interests": string[], "summary"?: string}';

export function summaryPrompt(contents: string[]): string {
  return [
    'Summarize the following user memories as concise bullet points under a "User:" heading.',
    'Keep at most 10 unique bullets.',
    '',
    contents.join('\n---\n'),
  ].join('\n');
}

export function profilePrompt(contents: string[], summary?: string): string {
  return [
    'Extract a structured user profile from these memories.',
    PROFILE_JSON_HINT,
    summary ? `Rolling summary:\n${summary}` : '',
    '',
    contents.join('\n---\n'),
  ]
    .filter(Boolean)
    .join('\n');
}

export async function buildSummary(
  contents: string[],
  llm: TextCompleter | null,
): Promise<string> {
  if (!llm) {
    return buildRollingSummary(contents);
  }
  return llm.complete(summaryPrompt(contents));
}

export async function buildProfile(
  contents: string[],
  summary: string | undefined,
  llm: TextCompleter | null,
): Promise<UserProfile> {
  if (!llm) {
    return deriveProfile(contents, summary);
  }

  const raw = await llm.complete(profilePrompt(contents, summary));
  const json = extractJsonObject(raw);
  const parsed = JSON.parse(json) as UserProfile;
  return {
    skills: Array.isArray(parsed.skills) ? parsed.skills.map(String) : [],
    interests: Array.isArray(parsed.interests) ? parsed.interests.map(String) : [],
    ...(parsed.summary ? { summary: String(parsed.summary) } : summary ? { summary } : {}),
  };
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('LLM profile response did not contain JSON');
  }
  return text.slice(start, end + 1);
}
