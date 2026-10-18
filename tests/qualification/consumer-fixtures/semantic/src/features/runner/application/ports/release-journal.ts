export interface ReleaseJournalPort {
  readonly append: (record: {
    readonly kind: "effect" | "resource-acquired" | "resource-released";
    readonly scope: string;
    readonly id: string;
    readonly value: string;
  }) => Promise<void>;
}
