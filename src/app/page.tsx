import Link from 'next/link'
import GreenJacketIcon from '@/components/GreenJacketIcon'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-10">
          <div className="flex justify-center mb-6">
            <GreenJacketIcon size={48} />
          </div>
          <h1 className="text-5xl md:text-6xl font-serif font-bold text-augusta mb-4 tracking-tight">
            Masters Pool
          </h1>
          <p className="text-lg text-muted-gray">
            Draft your squad. Track live scores. Win the green jacket.
          </p>
        </div>

        <div className="w-24 mx-auto border-t border-augusta/30 mb-10" />

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
      </div>
    </main>
  )
}
