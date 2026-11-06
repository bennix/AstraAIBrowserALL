// Keep real platform/mobile/engine identity for content negotiation, but withhold
// optional detailed hardware and OS-version hints in both HTTP and native JS APIs.
module.exports=function reduceDeviceHints(metadata){
 return {...metadata,platformVersion:'',architecture:'',bitness:'',model:'',wow64:false};
};
