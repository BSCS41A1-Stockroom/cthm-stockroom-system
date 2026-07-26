const months = [
  {
    month: "January",
    borrowings: 12
  },
  {
    month: "February",
    borrowings: 18
  },
  {
    month: "March",
    borrowings: 24
  },
  {
    month: "April",
    borrowings: 21
  },
  {
    month: "May",
    borrowings: 30
  },
  {
    month: "June",
    borrowings: 27
  }
];

export default function MonthlyBorrowingTable() {
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
              <td>{item.month}</td>
              <td>{item.borrowings}</td>
            </tr>
          ))}

        </tbody>

      </table>

    </div>
  );
}