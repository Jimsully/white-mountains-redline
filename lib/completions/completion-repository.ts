import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPLETION_REMOVE_FAILED, COMPLETION_SAVE_FAILED, isDuplicateCompletionError } from "@/lib/completions/errors";
import { mapSegmentCompletionRow } from "@/types/completion";
import type { SegmentCompletion, SegmentCompletionRow, ValidatedManualCompletionInput } from "@/types/completion";

const completionFields = "id, segment_id, completed_on, completion_method, created_at";

export class CompletionRepository {
  constructor(private readonly supabase: SupabaseClient, private readonly userId: string) {}

  async listOwnCompletions(): Promise<SegmentCompletion[]> {
    const { data, error } = await this.supabase
      .from("segment_completions")
      .select(completionFields)
      .eq("user_id", this.userId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(COMPLETION_SAVE_FAILED);
    return ((data ?? []) as SegmentCompletionRow[]).map(mapSegmentCompletionRow);
  }

  async markManualComplete(input: ValidatedManualCompletionInput): Promise<SegmentCompletion> {
    const payload = {
      user_id: this.userId,
      segment_id: input.segmentId,
      completed_on: input.completedOn,
      notes: input.notes,
    };

    const { data, error } = await this.supabase
      .from("segment_completions")
      .insert(payload)
      .select(completionFields)
      .single();

    if (!error) return mapSegmentCompletionRow(data as SegmentCompletionRow);

    if (isDuplicateCompletionError(error)) {
      const existing = await this.findOwnCompletion(input.segmentId);
      if (existing) return existing;
    }

    throw new Error(COMPLETION_SAVE_FAILED);
  }

  async removeCompletion(segmentId: string): Promise<void> {
    const { error } = await this.supabase
      .from("segment_completions")
      .delete()
      .eq("user_id", this.userId)
      .eq("segment_id", segmentId);

    if (error) throw new Error(COMPLETION_REMOVE_FAILED);
  }

  private async findOwnCompletion(segmentId: string) {
    const { data, error } = await this.supabase
      .from("segment_completions")
      .select(completionFields)
      .eq("user_id", this.userId)
      .eq("segment_id", segmentId)
      .maybeSingle();

    if (error) throw new Error(COMPLETION_SAVE_FAILED);
    return data ? mapSegmentCompletionRow(data as SegmentCompletionRow) : null;
  }
}