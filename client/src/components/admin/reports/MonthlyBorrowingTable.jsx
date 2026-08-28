function monthLabel(value) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })
    .format(new Date(year, month - 1, 1));
}

export default function MonthlyBorrowingTable({ months = [] }) {
  return (
    <div className="report-table-card">

      <h3>Monthly Borrowing Summary</h3>

      <table className="report-table">

        <thead>
          <tr>
            <th>Month</th>
            <th>Borrowings</th>
          </tr>
        </thead>

        <tbody>

          {months.map((item) => (
            <tr key={item.month}>
              <td>{monthLabel(item.month)}</td>
              <td>{item.borrowings}</td>
            </tr>
          ))}

          {months.length === 0 && <tr><td colSpan="2">No monthly activity available.</td></tr>}

        </tbody>

      </table>

    </div>
  );
}
