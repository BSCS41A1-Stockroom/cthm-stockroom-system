SELECT request.id
       FROM public.borrow_requests request
      WHERE (($1::uuid IS NOT NULL AND request.user_id = $1::uuid)
        OR (request.user_id IS NULL AND lower(trim(request.student_id)) = $2))
        AND (request.status = 'Borrowed' OR (request.status = 'Approved'
          AND request.borrow_date >= (now() AT TIME ZONE 'Asia/Manila')::date))
      ORDER BY request.id
      LIMIT 1