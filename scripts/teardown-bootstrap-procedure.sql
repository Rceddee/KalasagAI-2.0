-- ============================================================================
-- KALASAG AI 2.0 - TEARDOWN INITIAL SUPER ADMIN BOOTSTRAP PROCEDURES
-- Target Database: Development only (ydyawyqhvdlllqrtuxko)
-- NEVER EXECUTE ON PRODUCTION (fpfvouirptlkvzjsobfz)
-- NOTE: Do not execute until separate explicit authorization is given.
-- ============================================================================

-- 1. Remove public RPC wrapper
DROP FUNCTION IF EXISTS public.bootstrap_initial_super_admin(uuid, text);

-- 2. Remove private schema implementation
DROP FUNCTION IF EXISTS app_private.bootstrap_initial_super_admin(uuid, text);

-- Normal personnel management remains available via:
-- public.assign_personnel_role(p_user_id uuid, p_role personnel_role)
