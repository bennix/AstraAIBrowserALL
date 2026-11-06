function timezone(value){
 if(value==='')return '';
 if(typeof value!=='string'||value.length>100)throw Error('Invalid website timezone');
 try{return new Intl.DateTimeFormat('en',{timeZone:value}).resolvedOptions().timeZone;}catch{throw Error('Invalid website timezone');}
}
module.exports={timezone};
