import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Class-start reminders have been retired. Keep the endpoint harmless for any
// in-flight cron requests or older schedules that have not been removed yet.
serve(() => new Response(JSON.stringify({ disabled: true, sent: 0 }), {
  status: 200, headers: { 'Content-Type': 'application/json' },
}))
