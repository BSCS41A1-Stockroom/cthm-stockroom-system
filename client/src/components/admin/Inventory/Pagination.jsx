export default function Pagination() {
  return (
    <div className="pagination">

      <button className="page-btn">
        Previous
      </button>

      <button className="page-number active">
        1
      </button>

      <button className="page-number">
        2
      </button>

      <button className="page-number">
        3
      </button>

      <button className="page-btn">
        Next
      </button>

    </div>
  );
}