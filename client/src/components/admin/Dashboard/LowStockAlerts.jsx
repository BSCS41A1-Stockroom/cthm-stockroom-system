export default function LowStockAlerts() {

    const items=[

        "Microphone",
        "HDMI Cable",
        "Extension Cord",

    ];

    return (

        <div className="admin-card">

            <div className="card-header">

                <h3>Low Stock Alerts</h3>

            </div>

            {items.map((item,index)=>(

                <div
                    key={index}
                    className="low-stock-item"
                >

                    <span>{item}</span>

                    <strong>{index+1} left</strong>

                </div>

            ))}

        </div>

    );

}