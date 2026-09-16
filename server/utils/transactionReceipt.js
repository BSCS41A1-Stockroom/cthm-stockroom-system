"use strict";

async function createTransactionReceipt(client, { requestId, receiptType, returnId = null, createdBy = null }) {
  const hasValidReturnId = /^[1-9]\d*$/.test(String(returnId ?? ""));
  if (!client || !/^[1-9]\d*$/.test(String(requestId)) || !["claim", "return"].includes(receiptType)
      || (receiptType === "return" ? !hasValidReturnId : returnId != null)) throw new TypeError("A valid receipt transaction is required.");
  const result = await client.query(
    `INSERT INTO public.transaction_receipts (receipt_type,request_id,return_id,created_by,snapshot)
     SELECT $2,request.id,$3,$4,jsonb_build_object(
       'requestId',request.id,'studentName',request.student_name,'studentId',request.student_id,
       'borrowDate',request.borrow_date,'returnDate',request.return_date,'purpose',request.purpose,
       'processedBy',processor.full_name,
       'items',CASE WHEN $2='claim' THEN
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('inventoryId',item.inventory_id,'name',inventory.item_name,
           'quantity',item.quantity,'assets',(SELECT COALESCE(jsonb_agg(jsonb_build_object('assetNumber',asset.asset_number,'serialNumber',asset.serial_number) ORDER BY asset.asset_number),'[]'::jsonb)
             FROM public.borrowing_asset_assignments assignment JOIN public.inventory_assets asset ON asset.id=assignment.asset_id
            WHERE assignment.request_id=request.id AND assignment.inventory_id=item.inventory_id)) ORDER BY item.inventory_id),'[]'::jsonb)
            FROM public.borrow_request_items item JOIN public.inventory inventory ON inventory.id=item.inventory_id WHERE item.request_id=request.id)
         ELSE (SELECT COALESCE(jsonb_agg(jsonb_build_object('inventoryId',returned.inventory_id,'name',inventory.item_name,
           'goodQuantity',returned.good_quantity,'damagedQuantity',returned.damaged_quantity,'missingQuantity',returned.missing_quantity,
           'conditionNote',returned.condition_note,'assets',(SELECT COALESCE(jsonb_agg(jsonb_build_object('assetNumber',asset.asset_number,'serialNumber',asset.serial_number,'condition',assignment.return_condition,'conditionNote',assignment.condition_note) ORDER BY asset.asset_number),'[]'::jsonb)
             FROM public.borrowing_asset_assignments assignment JOIN public.inventory_assets asset ON asset.id=assignment.asset_id WHERE assignment.return_id=$3 AND assignment.inventory_id=returned.inventory_id)) ORDER BY returned.inventory_id),'[]'::jsonb)
            FROM public.borrowing_return_items returned JOIN public.inventory inventory ON inventory.id=returned.inventory_id WHERE returned.return_id=$3) END,
       'remarks',CASE WHEN $2='return' THEN (SELECT remarks FROM public.borrowing_returns WHERE id=$3) ELSE NULL END)
       FROM public.borrow_requests request LEFT JOIN public.profiles processor ON processor.user_id=$4
      WHERE request.id=$1
     ON CONFLICT DO NOTHING RETURNING *`,
    [requestId, receiptType, returnId, createdBy]
  );
  if (result.rowCount) return result.rows[0];
  const existing = await client.query(`SELECT * FROM public.transaction_receipts WHERE request_id=$1 AND (($2='claim' AND receipt_type='claim') OR ($2='return' AND return_id=$3))`, [requestId, receiptType, returnId]);
  if (!existing.rowCount) throw new Error("Unable to create the transaction receipt.");
  return existing.rows[0];
}

module.exports = { createTransactionReceipt };
