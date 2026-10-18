import { getInsightsData } from '@/lib/insights';
import { InsightsClient } from '@/components/InsightsClient';

export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  let initialData = null;
  try {
    initialData = await getInsightsData(7);
  } catch {
    // client fallback
  }

  return <InsightsClient initialData={initialData} />;
}
