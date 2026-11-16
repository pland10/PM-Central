// The notification categories a user can opt into. Pure/shared between the
// settings UI, the prefs API, and (Phase 3) the event triggers.
//
// `adminOnly` categories are hidden from non-admins in the UI AND rejected
// server-side if a non-admin tries to enable one. `personal` categories target
// a specific user (e.g. the work order's assignee) rather than broadcasting.

export type NotificationCategory = {
  key: string;
  label: string;
  description: string;
  adminOnly: boolean;
  personal: boolean; // delivered to a specific user, not broadcast to subscribers
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    key: "wo_assigned",
    label: "Work orders assigned to me",
    description: "When a work order is assigned to you, its stage changes, or a note is added to one of yours.",
    adminOnly: false,
    personal: true,
  },
  {
    key: "wo_new",
    label: "New / urgent work orders",
    description: "New work orders and ones flagged as needing attention.",
    adminOnly: true,
    personal: false,
  },
  {
    key: "payment_nsf",
    label: "Returned / NSF payments",
    description: "A rent payment bounced (returned / NSF).",
    adminOnly: true,
    personal: false,
  },
  {
    key: "batch_ready",
    label: "Rent batch ready to draw",
    description: "New payments to PMI Lighthouse in Rentvine are ready to batch (checked every 15 minutes).",
    adminOnly: true,
    personal: false,
  },
  {
    key: "sync_failure",
    label: "Sync / health failures",
    description: "A sync failed or the daily health report flags a problem.",
    adminOnly: true,
    personal: false,
  },
];

export const CATEGORY_KEYS = new Set(NOTIFICATION_CATEGORIES.map((c) => c.key));

export function categoryByKey(key: string): NotificationCategory | undefined {
  return NOTIFICATION_CATEGORIES.find((c) => c.key === key);
}

// Categories a user of this role is allowed to see / enable.
export function categoriesForRole(isAdmin: boolean): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter((c) => isAdmin || !c.adminOnly);
}

// Can a user of this role enable this category? (Unknown keys → false.)
export function canUseCategory(key: string, isAdmin: boolean): boolean {
  const c = categoryByKey(key);
  return !!c && (isAdmin || !c.adminOnly);
}
