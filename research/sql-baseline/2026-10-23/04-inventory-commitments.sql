WITH returned AS (
       SELECT request_id, inventory_id,
              SUM(good_quantity + damaged_quantity + missing_quantity)::bigint AS accounted
         FROM borrowing_return_items
        GROUP BY request_id, inventory_id
     )
     SELECT bri.inventory_id,
            COALESCE(SUM(CASE
              WHEN br.status = 'Borrowed' THEN GREATEST(bri.quantity - COALESCE(returned.accounted, 0), 0)
              ELSE bri.quantity
            END), 0)::bigint AS quantity,
            count(*) FILTER (WHERE bri.quantity IS NULL OR bri.quantity <= 0
              OR COALESCE(returned.accounted, 0) < 0
              OR COALESCE(returned.accounted, 0) > bri.quantity) > 0 AS has_invalid_quantity
       FROM borrow_request_items bri
       JOIN borrow_requests br ON br.id = bri.request_id
       LEFT JOIN returned ON returned.request_id = bri.request_id AND returned.inventory_id = bri.inventory_id
      WHERE bri.inventory_id::text = ANY($1::text[])
        AND (br.status = 'Borrowed' OR (
          br.status = ANY($2::text[])
          AND (br.borrow_date + COALESCE(br.start_time,time '00:00'))
            < CASE WHEN $6::time IS NULL THEN ($3::date + 1)::timestamp ELSE $3::date + $6::time END
          AND (CASE WHEN br.end_time IS NULL THEN (br.return_date + 1)::timestamp ELSE br.return_date + br.end_time END)
            > ($4::date + COALESCE($5::time,time '00:00'))
        ))
      GROUP BY bri.inventory_id