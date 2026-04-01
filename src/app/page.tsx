import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <div className="mb-8">
          <h1 className="text-5xl md:text-6xl font-serif font-bold text-augusta mb-4 tracking-tight">
            Masters Pool
          </h1>
          <p className="text-xl text-muted-gray">
            Draft your squad. Track live scores. Win the green jacket.
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/create"
            className="block w-full max-w-sm mx-auto bg-augusta text-white py-4 px-8 rounded-sm text-lg font-semibold hover:bg-augusta-dark transition-colors"
          >
            Create Your Pool
          </Link>
          <p className="text-sm text-muted-gray">
            Already have an invite? Ask your commissioner for the join link.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-3xl font-serif font-bold text-augusta">Draft</div>
            <p className="text-sm text-muted-gray mt-1">Live snake draft with your friends</p>
          </div>
          <div>
            <div className="text-3xl font-serif font-bold text-augusta">Track</div>
            <p className="text-sm text-muted-gray mt-1">Real-time scores from Augusta</p>
          </div>
          <div>
            <div className="text-3xl font-serif font-bold text-augusta">Win</div>
            <p className="text-sm text-muted-gray mt-1">Lowest score takes the pot</p>
          </div>
        </div>
      </div>
    </main>
  )
}
