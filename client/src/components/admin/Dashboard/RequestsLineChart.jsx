import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from "recharts";

export default function RequestsLineChart({ data = [] }) {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />

                <Line
                    type="monotone"
                    dataKey="approved"
                    stroke="#22c55e"
                    strokeWidth={3}
                />

                <Line
                    type="monotone"
                    dataKey="returned"
                    stroke="#3b82f6"
                    strokeWidth={3}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}
