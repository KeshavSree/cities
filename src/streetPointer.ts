/** Capture is optional: some mobile browsers throw even for an active touch. */
export function captureStreetPointer(element:Element,pointerId:number){
  try{element.setPointerCapture(pointerId);}catch{/* Keep initializing input when capture is unavailable. */}
}
