SELECT inventory_id, start_date::text AS start_date, end_date::text AS end_date, reason
       FROM public.inventory_unavailability
      WHERE inventory_id::text = ANY($1::text[])
        AND start_date <= $2::date
        AND end_date >= $3::date
      ORDER BY inventory_id, start_date, end_date