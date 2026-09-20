import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from "recharts";

const COLORS = {
    gold: "#B69B62",
    navy: "#17263C",
    muted: "#697381",
    grid: "#E5E0D6",
};

export default function RequestsLineChart({ data = [] }) {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <BarChart
                data={data}
                margin={{
                    top: 10,
                    right: 10,
                    left: 0,
                    bottom: 5,
                }}
                barGap={6}
                barCategoryGap="24%"
            >
                <CartesianGrid
                    stroke={COLORS.grid}
                    strokeDasharray="3 3"
                    vertical={false}
                />

                <XAxis
                    dataKey="month"
                    stroke={COLORS.muted}
                    tick={{
                        fill: COLORS.muted,
                        fontSize: 11,
                    }}
                    axisLine={{
                        stroke: COLORS.grid,
                    }}
                    tickLine={false}
                />

                <YAxis
                    stroke={COLORS.muted}
                    tick={{
                        fill: COLORS.muted,
                        fontSize: 11,
                    }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                />

                <Tooltip
                    cursor={{
                        fill: "rgba(23, 38, 60, 0.04)",
                    }}
                    contentStyle={{
                        background: "#FFFFFF",
                        border: `1px solid ${COLORS.grid}`,
                        borderRadius: "8px",
                        boxShadow:
                            "0 8px 24px rgba(16, 27, 45, 0.10)",
                        color: COLORS.navy,
                        fontSize: "12px",
                    }}
                    labelStyle={{
                        color: COLORS.navy,
                        fontWeight: 700,
                        marginBottom: "4px",
                    }}
                    itemStyle={{
                        color: COLORS.muted,
                    }}
                />

                <Bar
                    dataKey="approved"
                    name="Approved"
                    fill={COLORS.gold}
                    radius={[5, 5, 0, 0]}
                    maxBarSize={28}
                />

                <Bar
                    dataKey="returned"
                    name="Returned"
                    fill={COLORS.navy}
                    radius={[5, 5, 0, 0]}
                    maxBarSize={28}
                />
            </BarChart>
        </ResponsiveContainer>
    );
}