import {
    ResponsiveContainer,
    LineChart,
    Line,
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
    ivory: "#F5F3EE",
};

export default function RequestsLineChart({ data = [] }) {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <LineChart
                data={data}
                margin={{
                    top: 10,
                    right: 10,
                    left: 0,
                    bottom: 5,
                }}
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
                />

                <Tooltip
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

                <Line
                    type="monotone"
                    dataKey="approved"
                    name="Approved"
                    stroke={COLORS.gold}
                    strokeWidth={3}
                    dot={{
                        r: 4,
                        fill: COLORS.navy,
                        stroke: COLORS.gold,
                        strokeWidth: 2,
                    }}
                    activeDot={{
                        r: 6,
                        fill: COLORS.navy,
                        stroke: COLORS.gold,
                        strokeWidth: 2,
                    }}
                />

                <Line
                    type="monotone"
                    dataKey="returned"
                    name="Returned"
                    stroke={COLORS.navy}
                    strokeWidth={3}
                    dot={{
                        r: 4,
                        fill: COLORS.gold,
                        stroke: COLORS.navy,
                        strokeWidth: 2,
                    }}
                    activeDot={{
                        r: 6,
                        fill: COLORS.gold,
                        stroke: COLORS.navy,
                        strokeWidth: 2,
                    }}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}