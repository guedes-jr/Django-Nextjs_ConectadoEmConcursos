import Image from "next/image";

export type NoticeContentProps = {
  title:string; body:string; image_url:string; video_url:string; links:{label:string;url:string}[];
};

function webUrl(value:string) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

export function NoticeContent({title, body, image_url, video_url, links}:NoticeContentProps) {
  return <div className="space-y-4">
    {image_url && webUrl(image_url) && <Image src={image_url} alt={`Imagem do aviso: ${title}`} width={640} height={320} className="max-h-56 w-full rounded object-contain" unoptimized />}
    {video_url && webUrl(video_url) && <a className="block text-sm underline" href={video_url} target="_blank" rel="noreferrer noopener">Assistir ao vídeo em uma nova aba</a>}
    {body && <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{body}</p>}
    {links.length > 0 && <div className="flex flex-wrap gap-3">{links.filter(link => webUrl(link.url)).map((link, index) => <a key={`${index}-${link.url}`} href={link.url} target="_blank" rel="noreferrer noopener" className="text-sm underline">{link.label}</a>)}</div>}
  </div>;
}
