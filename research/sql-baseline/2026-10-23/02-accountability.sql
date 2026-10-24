SELECT case_number FROM public.accountability_cases
      WHERE user_id=$1::uuid AND status IN ('open','under_review')
      ORDER BY created_at,id LIMIT 1