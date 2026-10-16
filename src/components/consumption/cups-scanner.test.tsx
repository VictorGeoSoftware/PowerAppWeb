import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMERA_ERROR, CupsScanner, OCR_ERROR, RETRY_CAMERA } from "./cups-scanner";

const CUPS = "ES0031607515707001RC";

function fakeStream() {
  const track = { stop: vi.fn(), onended: null as null | (() => void) };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn(impl) }, configurable: true });
}

function fakeRecognizer(texts: string[]) {
  let i = 0;
  const rec = {
    recognize: vi.fn(async () => texts[Math.min(i++, texts.length - 1)]),
    terminate: vi.fn(async () => {}),
  };
  return { rec, create: vi.fn(async () => rec) };
}

const grab = () => true;
const field = () => screen.getByLabelText("Escanea o introduce tu código CUPS");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "mediaDevices");
  Reflect.deleteProperty(document, "hidden");
});

describe("CupsScanner", () => {
  it("fills the field from OCR and confirm stops the camera and submits the corrected code", async () => {
    const { stream, track } = fakeStream();
    mockGetUserMedia(async () => stream);
    const { rec, create } = fakeRecognizer([`TITULAR X CUPS: es 0O31 6075 1570 7001 rc TARIFA`]);
    const onConfirm = vi.fn();
    const { unmount } = render(<CupsScanner onConfirm={onConfirm} onClose={() => {}} createRecognizer={create} grab={grab} />);
    await act(() => vi.advanceTimersByTimeAsync(700));
    await waitFor(() => expect(field()).toHaveValue(CUPS));
    expect(screen.getByText("Formato válido")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledWith(CUPS);
    expect(track.stop).toHaveBeenCalled();
    unmount();
    expect(rec.terminate).toHaveBeenCalled();
  });

  it("manual edit is never overwritten by OCR; clearing re-enables fill", async () => {
    mockGetUserMedia(async () => fakeStream().stream);
    const { create } = fakeRecognizer([CUPS]);
    render(<CupsScanner onConfirm={() => {}} onClose={() => {}} createRecognizer={create} grab={grab} />);
    fireEvent.change(field(), { target: { value: "ES12" } });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(field()).toHaveValue("ES12");
    fireEvent.change(field(), { target: { value: "" } });
    await act(() => vi.advanceTimersByTimeAsync(1300));
    await waitFor(() => expect(field()).toHaveValue(CUPS));
  });

  it("camera denied shows the fallback and manual confirm still works", async () => {
    mockGetUserMedia(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const onConfirm = vi.fn();
    render(<CupsScanner onConfirm={onConfirm} onClose={() => {}} createRecognizer={fakeRecognizer([""]).create} grab={grab} />);
    expect(await screen.findByText(CAMERA_ERROR)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: RETRY_CAMERA })).toBeInTheDocument();
    fireEvent.change(field(), { target: { value: "es 0031 6075 1570 7001 rc" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledWith(CUPS);
  });

  it("missing mediaDevices (insecure context) shows the camera error", async () => {
    render(<CupsScanner onConfirm={() => {}} onClose={() => {}} createRecognizer={fakeRecognizer([""]).create} grab={grab} />);
    expect(await screen.findByText(CAMERA_ERROR)).toBeInTheDocument();
  });

  it("recognizer load failure shows the OCR message", async () => {
    mockGetUserMedia(async () => fakeStream().stream);
    render(
      <CupsScanner onConfirm={() => {}} onClose={() => {}} createRecognizer={() => Promise.reject(new Error("x"))} grab={grab} />,
    );
    expect(await screen.findByText(OCR_ERROR)).toBeInTheDocument();
  });

  it("Volver and Escape close; unmount stops tracks and terminates the worker", async () => {
    const { stream, track } = fakeStream();
    mockGetUserMedia(async () => stream);
    const { rec, create } = fakeRecognizer([""]);
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { unmount } = render(<CupsScanner onConfirm={onConfirm} onClose={onClose} createRecognizer={create} grab={grab} />);
    await waitFor(() => expect(create).toHaveBeenCalled());
    await act(() => vi.advanceTimersByTimeAsync(10));
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(track.stop).toHaveBeenCalled();
    expect(rec.terminate).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("pauses OCR while the tab is hidden", async () => {
    mockGetUserMedia(async () => fakeStream().stream);
    const { rec, create } = fakeRecognizer([""]);
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    render(<CupsScanner onConfirm={() => {}} onClose={() => {}} createRecognizer={create} grab={grab} />);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(rec.recognize).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(rec.recognize).toHaveBeenCalled();
  });
});
