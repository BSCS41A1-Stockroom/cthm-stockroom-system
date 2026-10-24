SELECT br.id, br.student_id, br.borrow_date, br.return_date, br.start_time, br.end_time, br.purpose, br.status,
            bri.inventory_id, bri.quantity
       FROM borrow_requests br
       LEFT JOIN borrow_request_items bri ON bri.request_id = br.id
      WHERE (($1::uuid IS NOT NULL AND br.user_id = $1::uuid)
        OR (br.user_id IS NULL AND lower(trim(br.student_id)) = $2))
        AND br.status = ANY($3::text[])
        AND (br.status = 'Borrowed' OR br.borrow_date >= (now() AT TIME ZONE 'Asia/Manila')::date)
      ORDER BY br.id, bri.inventory_id