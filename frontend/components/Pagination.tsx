export default function Pagination() {
  return (
    <div className="flex justify-center items-center gap-2 mt-8">
      {[1, 2, 3, 4, 5].map((page) => (
        <button
          key={page}
          className={`px-3 py-1.5 rounded-md text-sm border border-white/10
          ${page === 1
              ? "bg-blue-600 text-white"
              : "bg-[#020617] text-gray-300 hover:bg-[#0F172A]"
            }`}
        >
          {page}
        </button>
      ))}
    </div>
  );
}
