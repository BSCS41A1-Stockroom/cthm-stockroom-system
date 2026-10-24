SELECT inventory.id, inventory.item_name, inventory.quantity, inventory.additional_qty, inventory.replaces, inventory.missing,
            inventory.breakage,
            inventory.defective + CASE WHEN inventory.tracking_type='serialized' THEN
              (SELECT count(*)::integer FROM public.inventory_assets asset WHERE asset.inventory_id=inventory.id AND asset.status='available' AND asset.next_inspection_date IS NOT NULL AND asset.next_inspection_date <= $2::date)
              ELSE 0 END AS defective,
            inventory.total_loss
      FROM inventory
      WHERE inventory.id::text = ANY($1::text[])
      ORDER BY inventory.id
      FOR UPDATE