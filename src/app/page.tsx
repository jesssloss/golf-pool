import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-10">
          <div className="flex justify-center mb-6">
            <Image
              src="/pimento.png"
              alt="Pimento cheese sandwich"
              width={200}
              height={200}
              priority
            />
          </div>
          <div className="text-lg font-serif text-pimento/70 mb-1">2026</div>
          <h1 className="text-5xl md:text-6xl font-serif font-bold text-pimento mb-2 tracking-tight">
            Masters Pool
          </h1>
          <p className="text-xs text-muted-gray font-serif italic mb-4">
            Pimento Technology Incorporated
          </p>
          <p className="text-lg text-muted-gray">
            Draft your squad. Track live scores. Win the green jacket.
          </p>
        </div>

        <div className="w-24 mx-auto border-t border-pimento/30 mb-10" />

        <div className="space-y-4">
          <Link
            href="/create"
            className="block w-full max-w-sm mx-auto bg-pimento text-white py-4 px-8 rounded-sm text-lg font-semibold hover:bg-pimento-dark transition-colors"
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
