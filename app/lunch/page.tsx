// app/lunch/page.tsx
import MonthlyPlanner from './MonthlyPlanner';

type MenuItem = { id: string; name: string; active?: boolean };
type User = { id: string; name?: string; email?: string; locationId: string };
type KitchenItem = { itemId: string; name: string; qty: number };
type KitchenSession = { session: '12:30' | '13:00' | null; items: KitchenItem[] };
type KitchenDay = { date: string; sessions: KitchenSession[] };
type KitchenSummary = { byDate: KitchenDay[] };

const HQ_LOCATION_ID = 'cdfad621-d9d1-4801-942e-eab2e07d94e4';

export default function Page() {
  // You may already be pulling these from a hook; shown inline for clarity
  const user: User = {
    id: 'current-user-id', // replace with real user id from your auth context
    locationId: HQ_LOCATION_ID,
  };

  const menu: MenuItem[] = []; // replace with your real menu loader

  async function onSubmit(payload: {
    userId: string;
    locationId: string;
    month: string;
    lines: { date: string; itemId: string }[];
  }): Promise<void> {
    const r = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(t);
    }
  }

  async function getKitchenSummary(from: string, to: string): Promise<KitchenSummary> {
    const r = await fetch(`/api/kitchen?from=${from}&to=${to}&locationId=${HQ_LOCATION_ID}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Failed to load');
    // narrow to expected shape
    return j as KitchenSummary;
  }

  return (
    <div className="p-4">
      <MonthlyPlanner
        menu={menu}
        user={user}
        onSubmit={onSubmit}
        getKitchenSummary={getKitchenSummary}
      />
    </div>
  );
}
