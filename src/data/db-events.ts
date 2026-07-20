// Shared event names for the data layer (both adapters dispatch these).

/** Fired after every write so hooks/tabs can refetch. */
export const DB_UPDATED_EVENT = "tlg-db-updated";

/** Fired when the offline write queue grows or drains. */
export const OUTBOX_UPDATED_EVENT = "tlg-outbox-updated";
