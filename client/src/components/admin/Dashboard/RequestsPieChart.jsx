import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
} from "recharts";

const COLORS = [
    "#B69B62",
    "#17263C",
    "#8A8275",
    "#D4C49F",
];

export default function RequestsPieChart({ data = [] }) {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <PieChart>
                <Pie
                    data={data}
                    dataKey="value"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="#FFFFFF"
                    strokeWidth={2}
                >
                    {data.map((entry, index) => (
                        <Cell
                            key={index}
                            fill={COLORS[index % COLORS.length]}
                        />
                    ))}
                </Pie>

                <Tooltip
                    contentStyle={{
                        background: "#FFFFFF",
                        border: "1px solid #E5E0D6",
                        borderRadius: "8px",
                        boxShadow:
                            "0 8px 24px rgba(16, 27, 45, 0.10)",
                        color: "#17263C",
                        fontSize: "12px",
                    }}
                    itemStyle={{
                        color: "#697381",
                    }}
                />
            </PieChart>
        </ResponsiveContainer>
    );
}