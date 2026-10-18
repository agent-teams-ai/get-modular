export interface JournalPort {
  readonly append: (record: {
    readonly kind: "terminal";
    readonly scope: string;
    readonly id: string;
    readonly value: string;
  }) => Promise<void>;
}
