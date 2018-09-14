import React, { Component } from 'react';
import LoadingComponent from './LoadingComponent'; 
import Plot from 'react-plotly.js';
import {mapDivStyle,statRowStyle} from './styles'; 
import {baseLayout} from './MapStuff';
import CheckAndAppend from './helperFunctions/CheckAndAppend'; 
import GetRevs from './helperFunctions/GetRevs'; 
import GetLocation from './helperFunctions/GetLocation'; 
import RemoveDuplicateIps from './helperFunctions/RemoveDuplicateIps'; 
import FilterRevs from './helperFunctions/FilterRevs'; 
import Slider from 'react-rangeslider'; 
import ReactTimeout from 'react-timeout'; 
import 'react-rangeslider/lib/index.css'; 
import ControlBar from './ControlBar'; 

/* Some notes on what we need to do here: 

* Pulling data needs to be broken up. The wait time at present is unacceptable for most 
  pages that garner even modest interest. 

* Need to pull some telling stats. Page Size, # of edits, # Unique contributors, etc, 

* Can we identify vandals? And plot them acccordingly? Could be neat! Where are most vandals located? 

*/

class MapDiv extends Component{

	constructor(props){

		// super-size, anyone? 
		super(props); 
		// Some variables for potential use: 
    var D = new Date(); 

    // Initialize the state container: 
    this.state = { data: [{type: 'scattergeo'}], 
	    layout: baseLayout,
	    frameData: [],
	    config: {displayModeBar: false},
	    rawdata:[],
	    now:D.getTime(),
	    revPullComplete:false,
	    bday:null, 
	    revCount:0, 
	    maxTimes:1,
	    fetching:false, 
	    baseLayout:baseLayout, 
	    baseData:[{type: 'scattergeo'}],
	    cleared:true, 
	    width:window.innerWidth, 
	    height:window.innerHeight, 
	    currentFrame:0, 
	    sliderPosition:0,
	    muted:false, 
	    buffering:false, 
	    revArray:[], 
	    cont:null, 
	    articleAge:null, 
	    mapEnds:null, 
	    lineEnds:null,
	    labels:{}, 
	    tstep:null, 
	    lineData:[],
  	};

  	// Instantiating some audio (typewriter sounds) to be played as frames are animated. 
  	var abc = 'abcdefghijklmnopqrstuvwxyz'; 
  	var soundsArray = []; 
  	for(let j = 0; j < abc.length; j++){
  		var url = require("../../Assets/Sounds/" + abc[j] + ".mp3");  
  		soundsArray.push(new Audio(url)); 
  	}
  	this.soundsArray = soundsArray; 

 		// Some function, the utility of which will soon become apparent: 
		this.Unpack              = this.Unpack.bind(this); 
		this.framifyData         = this.framifyData.bind(this); 
		this.getFrameData        = this.getFrameData.bind(this); 
		this.getNumberOfFrames   = this.getNumberOfFrames.bind(this); 
		this.loopSounds          = this.loopSounds.bind(this); 
		this.playSound           = this.playSound.bind(this); 
		this.updateDimensions    = this.updateDimensions.bind(this);  
		this.onPlay              = this.onPlay.bind(this); 
		this.animate             = this.animate.bind(this); 
		this.sliderChangeHandler = this.sliderChangeHandler.bind(this); 
		this.onPause             = this.onPause.bind(this); 
		this.onMute              = this.onMute.bind(this); 
		this.RevPuller           = this.RevPuller.bind(this); 
		this.renderControlBar    = this.renderControlBar.bind(this); 
		this.renderStatRow       = this.renderStatRow.bind(this); 
		this.getLineFrames       = this.getLineFrames.bind(this); 
	}

  // To handle browser resize; 
  updateDimensions() {
    this.setState({width: window.innerWidth,height:window.innerHeight});
  }; 

  // Attached UpdateDimensions to our window: 
  componentDidMount() {
    window.addEventListener("resize", this.updateDimensions);
  }


  // componentDidUpdate is used to fetch and/or clear data for wiki_revs: 
	async componentDidUpdate(prevProps,prevState){

		// This ie executed when the user initial comes into the app.  
		if(prevProps.pageid != this.props.pageid && this.state.cleared == true){
			// This call pulls the first rev batch: 
			await this.RevPuller();
		}

		// Do we need to clear existing data, users has requested a new page: 
		else if(prevProps.pageid != this.props.pageid && this.state.cleared == false){
			var D = new Date(); 
			await this.setState({
				frameData:[],
				data:this.state.baseData,
				layout:this.state.baseLayout,
				sliderSteps:[],
				now:D.getTime(),
				revPullComplete:false,
				bday:null,
				articleAge:null, 
				revCount:0,
				maxTimes:1,
				fetching:false, 
				cleared:true,
				cont:null, 
		    mapEnds:null, 
		    lineEnds:null,
				labels:{}, 
				currentFrame:0, 
				sliderPosition:0, 
				anim:null, 
				lineData:[], 
				tstep:null, 
			});  
		}

		// Fetching after the clear: 
		else if(prevState.cleared == false && this.state.cleared == true){
			await this.RevPuller(); 
		}

		// Fetching additional revs... 
		else if(prevState.cont != this.state.cont && this.state.cont != null){
			await this.RevPuller(); 
		}

		// Setting state signifying that we have pulled all the revs for a given page: 
		else if(prevState.cont != null && this.state.cont == null){
			// And we tack on end label: 
			var labels   = this.state.labels; 
			var tEnd     = new Date(this.state.mapEnds[59]); 
			labels[599] = tEnd.toGMTString().slice(8,16);
			// Get a middle pt. too, 
			var tMid     = new Date(this.state.mapEnds[29]); 
			labels[599] = tMid.toGMTString().slice(8,16); 
			this.setState({revPullComplete:true,labels:labels})
			console.log('complete\n',this.state.frameData.length)
		}
		else if(prevState.revPullComplete == false && this.state.revPullComplete == true){
			var labels   = this.state.labels; 
			var tEnd     = new Date(this.state.mapEnds[59]); 
			labels[599] = tEnd.toGMTString().slice(8,16);
			// Get a middle pt. too, 
			var tMid     = new Date(this.state.mapEnds[29]); 
			labels[299] = tMid.toGMTString().slice(8,16); 
			this.setState({labels:labels})
		}

	}

	// Update when we receive new data: 
	shouldComponentUpdate(nextProps,nextState){

		// This tells us to being pulling the data: 
		if(nextProps && nextProps.pageid != this.props.pageid){
			return true; 
		}

		// Perhaps we have to clear things! 
		else if(this.state.cleared != nextState.cleared){
			return true; 
		}

		// This tell us to framfiy the data: 
		else if(nextState && nextState.revPullComplete == true){
			return true; 
		}

		// We have more revs: 
		else if(nextState && nextState.revArray != this.state.revArray){
			return true; 
		}

		// Tells us we have new frames and are ready to display accordingly: 
		else if(nextState && this.state.frameData.length && this.state.frameData.length != nextState.frames.length){
			return true; 
		}

		// We have a continue to fetch: 
		else if(nextState && this.state.cont != nextState.cont){
			return true; 
		}

		// Are we fetching data?
		else if(nextState && nextState.fetching != this.state.fetching){
			return true;
		}

		// Has the window been resized? (horizontally)
		else if(nextState && nextState.width != this.state.width){
			return true; 
		}

		// Has the window been resized? (vertically)
		else if(nextState && nextState.height != this.state.height){
			return true; 
		}

		// Has the slider moved?
		else if(nextState && nextState.sliderPosition != this.state.sliderPosition){
			return true; 
		}

		// If all else fails, we don't update the thing: 
		else{
			return false; 
		}

	}

	async RevPuller(){
		// Here we grab revs in batches of 500 or less. 
		try{

			// Grab some new revData:
			var revData    = await GetRevs(this.props.pageid,this.state.cont); 
			// Pagemark our rev-grabbing spot with a continue: 
			var cont       = revData.cont == null ? null : revData.cont; 
			// Determine the articles age: 
			var bdayObj    = new Date(revData.revs[0].timestamp); 
			var bday       = bdayObj.getTime(); 
			var articleAge = this.state.now - bday; 
			// Update rev count: 
			var revCount   = this.state.revCount; 
			revCount      += revData.revsPulled; 

			// Update state with article age and/or bday: 
			if(this.state.bday == null && this.state.articleAge == null){
				// Take this opportunity to make time vectors and labels: 
				var lineEnds = [], mapEnds = []; 
				// Fill up the arrays:
				for(let j = 0; j < 120; j++){
					var endpt = bday + ((j+1) * articleAge / 120); 
					lineEnds.push(endpt)
					if( j % 2 != 0){
						mapEnds.push(endpt); 
					}
				}
				// Begin to make the labeles for slider: 
				var bdayStr = bdayObj.toGMTString().slice(8,16); 
				var labels  = this.state.labels; 
				labels[0]   = bdayStr; 
				// Update the state: 
				this.setState({bday:bday,articleAge:articleAge,cleared:false,lineEnds:lineEnds,mapEnds:mapEnds,labels:labels,fetching:true}); 
			}
			

			// What is the most recent timestamp in our revData.revs array?
			var lastTime = new Date(revData.revs[revData.revs.length-1].timestamp); 
			// Putting it in ms form.
			lastTime = lastTime.getTime(); 
			// And seeing how many frames we can construct according to lastTime. 
			var framesToMake = this.getNumberOfFrames(lastTime,this.state.frameData); 
			console.log(framesToMake)
			// Clean up the revs // 
			var accRevs   = this.state.revArray.concat(revData.revs); 
      revData.revs  = FilterRevs(revData.revs); 
      revData.revs  =  RemoveDuplicateIps(revData.revs); 
      revData.revs  = await CheckAndAppend(revData.revs,this.state.revArray);  
			
      // Make desired number of line frames: 	
      if(framesToMake.lineFrames > 0){
      	var lineFrames = this.getLineFrames(accRevs,framesToMake.lineFrames); 
      }

      // Make desired number of map frames: 
			if(framesToMake.mapFrames > 0){
				// Make the frames: 
				var frames = this.framifyData(revData.revs,framesToMake.mapFrames); 
				// we update labels again: 
				var labels = this.state.labels; 
				if(frames.frameData.length != this.state.mapEnds.length){
					var labels = this.state.labels; 
					// get percent loaded: 
					var pct = Math.round((frames.frameData.length/60)*100).toString(); 
					labels[599] = pct + "% loaded..."
				}
				// Make a title: 
				// title string: 
				var annotations = [
			  	{
			  		text: revData.title, 
			  		font:{family:'courier',size:18,color:'white',weight:400}, 
			  		y:0.99,
			  		showarrow:false,
			  		bgcolor:'black',
			  		visible:true,
			  	}
  			]; 
  			var layout = this.state.layout; 
  			layout.annotations = annotations; 
  			var complete = cont == null ? true:false; 
  			console.log(complete);
				this.setState({
					revCount:revCount,
					revArray:accRevs,
					frameData:frames.frameData,
					maxTimes:frames.maxTimes, 
					fetching:false,
					cont:cont,
					labels:labels, 
					layout:layout, 
					revPullComplete:complete,
				});			
			}
			else{
				this.setState({
					revCount:revCount,
					revArray:accRevs,
					cont:cont
				});		
			}
		}
		catch(error){
			console.log('Error in search result handler: ', error); 
		}
	}


	// A function to determine how many frames we can assemble with the most recently pulled rev batch: 
	getNumberOfFrames(lastTime){
		// The last timestamp in each timesArray should be the most recent. Put all the 
		var timePercent        = (lastTime - this.state.bday) / this.state.articleAge; 
		// Map frames:  
		var numberOfMapFrames  = Math.ceil(timePercent * 60) - this.state.frameData.length; 
		// Line frames: 
		var numberOfLineFrames = Math.ceil(timePercent * 120) - this.state.frameData.length;
		// return the numbers:  
		return {mapFrames:numberOfMapFrames,lineFrames:numberOfLineFrames}
	}

	// Assembling data for our line chart: 
	getLineFrames(revs,framesToMake){
		// Establish where we left off: 
		var lineData = this.state.lineData; 
		// Iterate and add more data entries to this thing: 
		for(let i = lineData.length; i < framesToMake + lineData.length; i++){
			var startTime = i == 0 ? this.state.articleAge : this.state.lineEnds[i-1]; 
			var endTime   = this.state.lineEnds[i]; 
			// Determine how many revs are between these point. 
			var filteredRevs = revs.filter( (x) => {
					var timeObject = new Date(x.timestamp); 
					var msTime = timeObject.getTime(); 
					if( msTime >= startTime && msTime < endTime ){
						return true; 
					}
					else{
						return false; 
					}
				}
			); 
			console.log('line revs: ', filteredRevs.length);  
		}
	}

	// Function to place data into frames as dictated by the incoming data: 
	framifyData(revArray,framesToMake){
		try{
			// Getthe 'maxTimes'. This might be unnecessary... 
			var times = revArray.map( (x) => {
				return x.timesArray.length; 
			})
			var maxTimes = Math.max(...times);
			var newFrames = []; 
			var oldFrames = this.state.frameData; 
			// Filter data according to frame! 
			for(let i = oldFrames.length; i < oldFrames.length + framesToMake; i++){
				// Get max time. 
				// Filter revs accordingly: 
				var filteredData = revArray.filter( (x) => {
					var tIndex = x.timesArray.findIndex( t => t < this.state.mapEnds[i]); 
					if(tIndex != -1){
						return true
					}
					else{
						return false; 
					}
				}).map(
					(x) => {
						var last_t_index = x.timesArray.findIndex( t => t > this.state.mapEnds[i]);
						if(last_t_index != -1){
							x.timesArray = x.timesArray.slice(0,last_t_index);
						}
						return x 
					}
				);
				newFrames.push(filteredData); 			 
			}
			newFrames = this.getFrameData(newFrames,maxTimes)
			var nn = oldFrames.concat(newFrames);
			return{frameData:nn,maxTimes:maxTimes}; 
			oldFrames = null; 
		}
		catch(error){
			console.log('ERROR: ', error)
			return null
		}
	}

	getFrameData(data,maxTimes){

		// data is an Array of frames. Update accordingly: 
		var mappedData = data.map(
			(x) => {
				// Get the data from x, an array of objects: 
				var lats       = this.Unpack(x,'latitude') ;
		    var lons       = this.Unpack(x,'longitude'); 
		    var tstamps    = this.Unpack(x,'timesArray'); 
	      // Arrays to house of plot info:  
		    var markerSizes     = []; 
		    var textArray       = []; 
		    var markerColors    = []; 
		    var markerOpacities = [];
		    var scale           = 30; 
		    x.forEach(
		    	(y,index) => {
				    var markerSize = Math.log(y.timesArray.length * Math.E) * 3;  
				    var editStr = y.timesArray.length == 1 ? ' Edit from ' : ' Edits from '; 
			      var markerText = '<b>' + y.timesArray.length.toString() + editStr; 
			      if(y.city && y.city.length != 0){
			          markerText = markerText + y.city + ","; 
			      }
			      if(y.region_name && y.region_name.length != 0){
			        markerText = markerText + y.region_name + ","; 
			      }
			      if(y.country_name && y.country_name.length != 0){
			        markerText = markerText + y.country_name + '.'; 
			      }
			      markerText = markerText + '</b>'; 
			      textArray.push(markerText); 
			      markerSizes.push(markerSize); 
			      markerColors.push('white');
			      markerOpacities.push(y.timesArray.length / maxTimes); 	    		
		    	}
		    )
		    var dataContainer = [{
		      type: 'scattergeo',
		      lat: lats,
		      lon: lons,
		      hoverinfo: 'text',
		      hoverlabel:{font:{family:'Courier New',size:14}},
		      text: textArray,
		      marker: {
		        size: markerSizes,
		        line: {
		          color: 'white',
		          width: 2
		        },
		        color: markerColors,
		      }, 
		      dates:tstamps, 
		    }]
		    return dataContainer
			}
		)
    return mappedData
	}

	Unpack(rows,key) {
	  return rows.map(function(row) { return row[key]; });
	}

	// A function to loop sounds; the number of iterations determined by the number of revs in each frame. 
	loopSounds(index){ 
		console.log(index,this.state.frameData.length)
		var numEdits = this.state.frameData[index][0].lat.length; 
		if(index > 0){
			numEdits = numEdits - this.state.frameData[index-1][0].lat.length; 
		}
		var numSounds = Math.ceil(numEdits / this.state.maxTimes) * 10; 
		for(let j = 0; j < numSounds; j++){
			this.playSound(); 
		}
	}

	// A function to play sounds, as called by loopSounds(). 
	playSound(){
		var i = Math.floor(Math.random() * Math.floor(26));
		if(this.soundsArray[i].currentTime > 0.6){
			this.soundsArray[i].pause(); 
			this.soundsArray[i].currentTime = 0; 
		}
		this.soundsArray[i].volume = this.state.muted ? 0 : 1; 
		this.soundsArray[i].play();
	}

	async animate(){
		if(this.state.anim != null){
			// Have we initialized tstep yet? 
			if(this.state.tstep == null && this.state.frameData.length > 0){
				var tstep = 0; 
			}
			// Else we check to see if we have more data to display: 
			else if(this.state.tstep != null && Math.ceil(this.state.tstep/10) <= this.state.frameData.length-1){
				var tstep = this.state.tstep + 1; 
			}
			else if(this.state.tstep != null && Math.ceil(this.state.tstep/10) == this.state.frameData.length){
				this.props.clearInterval(this.state.anim); 
				this.setState({anim:null});	
				var tstep = this.state.tstep; 
			}
			else{
				var tstep = this.state.tstep; 
			}
			// We do things with the current tstep: 
			if(tstep != this.state.tstep){
				if(tstep % 10 == 0){
					// We update current frame: 
					var currentFrame = tstep/10; 
					var lineFrame    = Math.round(tstep/5); 
					var data         = this.state.frameData[currentFrame];
					// var lineData     = this.state.lineData[lineFrame]; 
					// Play thte sounds: 
					this.loopSounds(currentFrame); 
					// update the data: 
					this.setState({data:data,currentFrame:currentFrame,tstep:tstep,sliderPosition:tstep}); 
				}
				else if(tstep % 5 == 0){
					var lineFrame    = Math.round(tstep/5); 
					// var lineData     = this.state.lineData[lineFrame]; 
					// update the data in state: 
					this.setState({tstep:tstep,sliderPosition:tstep}); 					
				}
				else{
					this.setState({tstep:tstep,sliderPosition:tstep})
				}
			}
		}
		else{
			this.props.clearInterval(this.state.anim); 
			this.setState({anim:null});		
		}
	}

	async onPlay(){
		// Loop through frames. Updating this.state.data! 

		// Making sure we have frames, and that we want to shift from pause to play: 
		if(this.state.frameData.length > 0 && this.state.anim == null){
			// Animate:
			this.setState({anim:this.props.setInterval(this.animate, 30)}); 	
		}	
		// Else, we are playing, and we seek tp pause: 
		else if(this.state.anim != null){
			this.props.clearInterval(this.state.anim);
			this.setState({anim:null}); 
		}
	}

	onPause(){
		this.props.clearInterval(this.state.anim); 
		this.setState({anim:null}); 
	}

	onMute(){
		var muted = !this.state.muted; 
		this.setState({muted:muted}); 
	}


	async sliderChangeHandler(val){
		// handling slider changes... 
		this.onPause(); 
		if(val != this.state.sliderPosition){
			// The first condition satisifies when the user moves the slider when there are frames, 
			// and an animation is not in progress: 
			if(this.state.frameData.length > 0){
				var roundedVal = Math.floor(val/10); 
				if(roundedVal >= this.state.frameData.length){
					roundedVal = this.state.frameData.length-1; 
				}
				var data = this.state.frameData[roundedVal]; 
				await this.setState({data:data,currentFrame:roundedVal,sliderPosition:val,anim:null,tstep:val}); 
				this.loopSounds(roundedVal); 
			}
			// What if the slider 
			else if(this.state.frameData.length == 0){
				this.setState({sliderPosition:0,})
			}
		}
	}

	renderStatRow(){
		if(this.state.frameData.length > 0){
			return(
				<div style ={statRowStyle}>
					<div style ={{width:window.innerWidth/3,height:15,alignItems:'center',justifyContent:'center',display:'flex',flexDirection:'row',fontSize:12}}>
						SIZE
					</div>
					<div style ={{width:window.innerWidth/3,height:15,alignItems:'center',justifyContent:'center',display:'flex',fontSize:12}}>
						REV COUNT
					</div>
					<div style = {{width:window.innerWidth/3,height:15,alignItems:'center',justifyContent:'center',display:'flex',fontSize:12}}>
						UNIQUE CONTRIBUTORS
					</div>
				</div>
			); 
		}
		else{
			return(null); 
		}
	}

	renderControlBar(){
		if(this.state.frameData.length > 0){
			// need to update the labels: 
			return(
	      <ControlBar
	      	onPlay         = {this.onPlay}
	      	onPause        = {this.onPause}
	      	onMute         = {this.onMute}
	      	onSliderChange = {this.sliderChangeHandler}
	      	sliderVal      = {this.state.sliderPosition}
	      	playing        = {this.state.anim}
	      	style          = {{width:window.innerWidth,height:100}}
	      	labels         = {this.state.labels}
	      />
			)
		}
		else{
			return(null); 
		}
	}

	// Define a render function for our class: 
	render(){

		var layout = this.state.layout; 
		var frames = this.state.frameData; 
		var data = this.state.data; 
		if(this.state.fetching == true){
			return(
				<div style = {mapDivStyle}>
					<LoadingComponent/>
				</div>
			)
		}
		else if(this.state.fetching == false && this.state.data && this.state.layout && this.state.frameData){
			return(
				<div style = {mapDivStyle}>
		      <Plot
		        data={this.state.data}
		        layout           = {this.state.layout}
		        config           = {{displayModeBar: false}}
		        style            = {{width:"100%", height:window.innerHeight-260}}
		        useResizeHandler = {true}
	          onInitialized    = {(figure) => this.setState(figure)}
	          onRelayout       = {(figure) => {this.setState(figure)}}
		      >
		      </Plot>
		      {this.renderStatRow()}
		      <div style = {{width:"100%",display:'flex',flexDirection:'row',justifyContent:'center'}}>
		      <Plot
		        data={[
		          {
		            x: [0, 1, 2],
		            y: [100, 0, 10],
		            type: 'scatter',
		            mode: 'lines',
		            hoverinfo: 'none'
		          },
		          {
		            x: [0, 1, 2],
		            y: [10, 0, 20],
		            type: 'scatter',
		            mode: 'lines',
		            marker:{color:'red'}, 
		            hoverinfo: 'none'
		          },
		        ]}
		        config = {{displayModeBar: false}}
		        layout ={{
		        	height: 80,
		        	width:window.innerWidth*0.6,
		        	plot_bgcolor:"black",
		        	paper_bgcolor:"#000",
		        	margin:{l:0,r:0,t:0,b:0},
		        	showlegend: false,
		        	hoverinfo: 'none',
		        }}
		        style  = {{width:"60%", height:80,overflow:'hidden',align:'center'}}
		      />
		      </div>
		      {this.renderControlBar()}
		    </div>
			)
		}
		else{
			return(
				<div style = {mapDivStyle}>
					<LoadingComponent/>
				</div>
			)
		}
	}////
}

export default ReactTimeout(MapDiv)



