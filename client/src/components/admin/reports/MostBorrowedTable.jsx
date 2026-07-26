const data = [
  {
    item: "Chef Knife",
    borrowed: 58
  },
  {
    item: "Mixing Bowl",
    borrowed: 44
  },
  {
    item: "Frying Pan",
    borrowed: 37
  },
  {
    item: "Cutting Board",
    borrowed: 32
  },
  {
    item: "Measuring Cup",
    borrowed: 29
  }
];

export default function MostBorrowedTable() {
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
            <tr key={item.item}>
              <td>{item.item}</td>
              <td>{item.borrowed}</td>
            </tr>
          ))}

        </tbody>

      </table>

    </div>
  );
}