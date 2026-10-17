// Full-screen branded loading state shared by the manager and estimate pages while a saved session loads.
export function ManagerLoadingScreen({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#eef3f5] px-4">
      <img src="/weve-mark.webp" width={176} height={145} alt="WEVE DESIGN" className="manager-loading-logo h-auto w-[132px]" />
      <div className="mt-9 h-[3px] w-44 overflow-hidden rounded-full bg-[#d5dde2]">
        <div className="manager-loading-bar h-full w-1/3 rounded-full bg-[#38a9bd]" />
      </div>
      <p className="mt-4 text-sm font-semibold text-[#60717d]">{message}</p>
    </div>
  );
}
