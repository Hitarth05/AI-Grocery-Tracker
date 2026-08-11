/**
 * Hand-written to match supabase/migrations/0001_initial_schema.sql.
 *
 * Once a Supabase project is linked, regenerate instead of editing by hand:
 *   pnpm exec supabase gen types typescript --local > src/types/database.ts
 */

export type SpaceType = "household" | "business" | "office";
export type StorageLocation = "pantry" | "fridge" | "freezer" | "other";
export type ExpirySource = "printed" | "estimated" | "manual";
export type ItemStatus = "active" | "consumed" | "tossed" | "expired";
export type ExtractionMethod = "date_ocr" | "classification" | "hybrid";
export type PrintedDateType =
  | "use_by"
  | "best_before"
  | "sell_by"
  | "manufacture"
  | "unknown";
export type NotificationType = "expiring_soon" | "expired";
export type NotificationChannel = "push" | "email";
export type SpaceRole = "owner" | "member";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Profile = {
  id: string;
  display_name: string | null;
  default_space_id: string | null;
  reminder_lead_days: number;
  push_enabled: boolean;
  email_enabled: boolean;
  created_at: string;
}

export type Space = {
  id: string;
  name: string;
  type: SpaceType;
  created_at: string;
}

export type SpaceMember = {
  space_id: string;
  user_id: string;
  role: SpaceRole;
  added_at: string;
}

export type CatalogItem = {
  id: string;
  name: string;
  aliases: string[];
  category: string | null;
  has_printed_date: boolean;
  shelf_life_pantry_days: number | null;
  shelf_life_fridge_days: number | null;
  shelf_life_freezer_days: number | null;
  shelf_life_opened_days: number | null;
  source: string | null;
  created_at: string;
}

export type Extraction = {
  id: string;
  space_id: string;
  created_by: string | null;
  photo_path: string | null;
  method: ExtractionMethod;
  raw_model_output: Json | null;
  predicted_name: string | null;
  predicted_date: string | null;
  predicted_date_type: PrintedDateType | null;
  confidence: number | null;
  needs_review: boolean;
  user_confirmed: boolean;
  final_name: string | null;
  final_date: string | null;
  was_corrected: boolean | null;
  created_at: string;
}

export type InventoryItem = {
  id: string;
  space_id: string;
  catalog_item_id: string | null;
  extraction_id: string | null;
  display_name: string;
  quantity: number;
  unit: string | null;
  storage_location: StorageLocation;
  expiry_date: string | null;
  expiry_source: ExpirySource;
  opened: boolean;
  opened_at: string | null;
  status: ItemStatus;
  resolved_at: string | null;
  added_at: string;
}

export type Notification = {
  id: string;
  inventory_item_id: string;
  user_id: string;
  type: NotificationType;
  channel: NotificationChannel;
  sent_at: string;
  responded: boolean;
  response_action: ItemStatus | null;
}

/** Keys whose column accepts NULL — omittable on insert. */
type NullableKeys<T> = {
  [K in keyof T]-?: null extends T[K] ? K : never;
}[keyof T];

/**
 * `Defaulted` is the NOT NULL columns that carry a database default, listed per
 * table because the same column name means different things across tables —
 * `notifications.type` is required, `spaces.type` defaults to 'household'.
 */
type TableFor<Row, Defaulted extends keyof Row = never> = {
  Row: Row;
  Insert: Omit<Row, Defaulted | NullableKeys<Row>> &
    Partial<Pick<Row, Defaulted | NullableKeys<Row>>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableFor<
        Profile,
        "reminder_lead_days" | "push_enabled" | "email_enabled" | "created_at"
      >;
      spaces: TableFor<Space, "id" | "type" | "created_at">;
      space_members: TableFor<SpaceMember, "role" | "added_at">;
      catalog_items: TableFor<
        CatalogItem,
        "id" | "aliases" | "has_printed_date" | "created_at"
      >;
      extractions: TableFor<
        Extraction,
        "id" | "needs_review" | "user_confirmed" | "created_at"
      >;
      inventory_items: TableFor<
        InventoryItem,
        "id" | "quantity" | "storage_location" | "opened" | "status" | "added_at"
      >;
      notifications: TableFor<Notification, "id" | "sent_at" | "responded">;
    };
    Views: Record<never, never>;
    Functions: {
      is_space_member: {
        Args: { target_space_id: string };
        Returns: boolean;
      };
      is_space_owner: {
        Args: { target_space_id: string };
        Returns: boolean;
      };
      create_space: {
        Args: { space_name: string; kind?: SpaceType };
        Returns: string;
      };
      mark_expired_items: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: {
      space_type: SpaceType;
      storage_location: StorageLocation;
      expiry_source: ExpirySource;
      item_status: ItemStatus;
      extraction_method: ExtractionMethod;
      printed_date_type: PrintedDateType;
      notification_type: NotificationType;
      notification_channel: NotificationChannel;
      space_role: SpaceRole;
    };
    CompositeTypes: Record<never, never>;
  };
}
