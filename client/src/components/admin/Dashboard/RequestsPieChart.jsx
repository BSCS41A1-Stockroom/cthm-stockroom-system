import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
} from "recharts";

const data = [
    { name: "Approved", value: 12 },
    { name: "Returned", value: 6 },
    { name: "Pending", value: 4 },
    { name: "Cancelled", value: 2 },
];

const COLORS = [
    "#22c55e",
    "#3b82f6",
    "#facc15",
    "#ef4444",
];

export default function RequestsPieChart() {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <PieChart>

                <Pie
                    data={data}
                    dataKey="value"
                    innerRadius={55}
                    outerRadius={80}
                >

                    {data.map((entry, index) => (

                        <Cell
                            key={index}
                            fill={COLORS[index]}
                        />

                    ))}

                </Pie>

                <Tooltip />

            </PieChart>
        </ResponsiveContainer>
    );
}