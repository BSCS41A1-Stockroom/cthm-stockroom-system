import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { inventoryStockStatus, inventoryTotals } from "../../../utils/inventoryAvailability";

export default function LowStockAlerts() {
    const [items, setItems] = useState([]);
    const [error, setError] = useState("");

    const loadLowStock = useCallback(async () => {
        const { data, error: queryError } = await supabase
            .from("inventory")
            .select("id, item_name, quantity, additional_qty, replaces, missing, breakage, defective, total_loss, reserved_quantity, borrowed_quantity, low_stock_threshold")
            .order("item_name");

        if (queryError) {
            setError(queryError.message);
            return;
        }

        setError("");
        setItems((data || [])
            .filter((item) => inventoryStockStatus(item) !== "in-stock")
            .map((item) => ({ ...item, ...inventoryTotals(item) }))
            .sort((left, right) => left.available - right.available));
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(loadLowStock, 0);
        const channel = supabase
            .channel("dashboard-low-stock")
            .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, loadLowStock)
            .subscribe();

        return () => {
            window.clearTimeout(timer);
            supabase.removeChannel(channel);
        };
    }, [loadLowStock]);

    return (

        <div className="admin-card">

            <div className="card-header">

                <h3>Low Stock Alerts</h3>

            </div>

            {error && <p className="dashboard-state error">Unable to load inventory alerts.</p>}
            {!error && items.length === 0 && <p className="dashboard-state">All inventory levels are healthy.</p>}

            {items.map((item)=>(

                <div
                    key={item.id}
                    className="low-stock-item"
                >

                    <span>{item.item_name}</span>

                    <strong>{item.available} left · alert at {item.threshold}</strong>

                </div>

            ))}

        </div>

    );

}
