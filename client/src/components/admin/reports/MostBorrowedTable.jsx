export default function MostBorrowedTable({ data = [] }) {
  return (
    <div className="report-table-card">

      <h3>Most Borrowed Items</h3>

      <table className="report-table">

        <thead>
          <tr>
            <th>Item</th>
            <th>Total Borrowed</th>
          </tr>
        </thead>

        <tbody>

          {data.map((item) => (
            <tr key={item.id}>
              <td>{item.item}</td>
              <td>{item.borrowed}</td>
            </tr>
          ))}

          {data.length === 0 && <tr><td colSpan="2">No borrowing activity in this period.</td></tr>}

        </tbody>

      </table>

    </div>
  );
}
