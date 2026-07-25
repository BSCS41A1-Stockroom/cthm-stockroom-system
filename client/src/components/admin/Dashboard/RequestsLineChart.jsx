import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from "recharts";

const data = [
    { day: "May 1", approved: 2, returned: 1 },
    { day: "May 5", approved: 8, returned: 2 },
    { day: "May 10", approved: 7, returned: 5 },
    { day: "May 15", approved: 12, returned: 6 },
    { day: "May 20", approved: 10, returned: 8 },
];

export default function RequestsLineChart() {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
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