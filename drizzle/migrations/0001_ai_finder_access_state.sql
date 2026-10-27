CREATE TABLE public.ai_finder_access_state (
 id text PRIMARY KEY,
 denial_message text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_finder_access_state TO service_role;
ALTER TABLE public.ai_finder_access_state ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ai_finder_access_state IS 'Server-only durable AI provider access circuit breaker; no learner data.';