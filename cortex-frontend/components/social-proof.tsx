import Image from "next/image"

export function SocialProof() {
  return (
    <section className="w-full py-16 flex flex-col items-center gap-10">
      
      <div className="text-center text-gray-300 text-lg font-semibold">
        Connects with your existing tools
      </div>

      <div className="w-full max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-12 justify-items-center items-center">
        <img src="/tools/slack.svg" alt="Slack" className="h-16 w-auto opacity-80 object-contain" />
        <img src="/tools/github.svg" alt="GitHub" className="h-16 w-auto opacity-80 object-contain" />
        <img src="/tools/notion.svg" alt="Notion" className="h-16 w-auto opacity-80 object-contain" />
        <img src="/tools/google-drive.svg" alt="Google Drive" className="h-16 w-auto opacity-80 object-contain" />
      </div>

    </section>
  )
}